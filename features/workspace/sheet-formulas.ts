import type { SheetCell } from "./workspace.types";

export type SheetComputedValue = string | number;
const CELL = /^[A-Z]([1-9]\d{0,2}|1000)$/;
const validAddress = (address: string) => CELL.test(address);

function rangeAddresses(range: string): string[] | null {
  const match = /^([A-Z](?:[1-9]\d{0,2}|1000)):([A-Z](?:[1-9]\d{0,2}|1000))$/.exec(range);
  if (!match || !validAddress(match[1]) || !validAddress(match[2])) return null;
  const [startCol, endCol] = [match[1].charCodeAt(0), match[2].charCodeAt(0)];
  const [startRow, endRow] = [Number(match[1].slice(1)), Number(match[2].slice(1))];
  const addresses: string[] = [];
  for (let row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row += 1) {
    for (let col = Math.min(startCol, endCol); col <= Math.max(startCol, endCol); col += 1) addresses.push(`${String.fromCharCode(col)}${row}`);
  }
  return addresses;
}

function arithmetic(expression: string, resolve: (address: string) => SheetComputedValue): SheetComputedValue {
  const tokens = expression.match(/\s*([A-Z]+\d+|\d+(?:\.\d+)?|[()+\-*/])\s*/g)?.map((token) => token.trim()) ?? [];
  if (!tokens.length || tokens.join("") !== expression.replace(/\s/g, "")) return "#ERROR!";
  let index = 0;
  const atom = (): SheetComputedValue => {
    const token = tokens[index++];
    if (token === "(") { const value = add(); return tokens[index++] === ")" ? value : "#ERROR!"; }
    if (token === "+" || token === "-") { const value = atom(); return typeof value === "number" ? (token === "-" ? -value : value) : value; }
    if (/^\d/.test(token ?? "")) return Number(token);
    if (/^[A-Z]+\d+$/.test(token ?? "")) {
      if (!validAddress(token)) return "#REF!";
      const value = resolve(token);
      if (typeof value === "number") return value;
      if (value === "") return 0;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : value.startsWith("#") ? value : "#VALUE!";
    }
    return "#ERROR!";
  };
  const multiply = (): SheetComputedValue => {
    let left = atom();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const op = tokens[index++]; const right = atom();
      if (typeof left !== "number" || typeof right !== "number") return typeof left === "string" && left.startsWith("#") ? left : right;
      if (op === "/" && right === 0) return "#DIV/0!";
      left = op === "*" ? left * right : left / right;
    }
    return left;
  };
  const add = (): SheetComputedValue => {
    let left = multiply();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const op = tokens[index++]; const right = multiply();
      if (typeof left !== "number" || typeof right !== "number") return typeof left === "string" && left.startsWith("#") ? left : right;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };
  const result = add();
  return index === tokens.length ? result : "#ERROR!";
}

export function evaluateSheet(cells: Record<string, SheetCell>): Record<string, SheetComputedValue> {
  const computed: Record<string, SheetComputedValue> = {};
  const visiting = new Set<string>();
  const cycleMembers = new Set<string>();
  const stack: string[] = [];
  const evaluate = (address: string): SheetComputedValue => {
    if (address in computed) return computed[address];
    if (visiting.has(address)) {
      stack.slice(stack.indexOf(address)).forEach((item) => cycleMembers.add(item));
      return "#CYCLE!";
    }
    if (stack.length >= 128) return "#LIMIT!";
    const raw = cells[address]?.value ?? "";
    if (typeof raw === "number" || !String(raw).startsWith("=")) {
      const numeric = typeof raw === "string" && raw.trim() && cells[address]?.format !== "text" && Number.isFinite(Number(raw));
      const value = numeric ? Number(raw) : raw;
      if (address in cells) computed[address] = value;
      return value;
    }
    const expression = String(raw).slice(1).trim().toUpperCase().replace(/\$/g, "");
    if (expression.length > 1024) return computed[address] = "#LIMIT!";
    visiting.add(address); stack.push(address);
    const calculate = (): SheetComputedValue => {
      if (expression.includes("#REF!")) return "#REF!";
      let expanded = expression;
      for (let pass = 0; pass < 64; pass++) {
        const match = /([A-Z]+)\(([^()]*)\)/.exec(expanded);
        if (!match) return arithmetic(expanded, evaluate);
        const fn = match[1];
        if (!["SUM", "AVERAGE", "MIN", "MAX", "COUNT", "COUNTA", "ROUND", "ABS"].includes(fn)) return "#NAME?";
        const values: SheetComputedValue[] = [];
        for (const argument of match[2].split(/[,;]/)) {
          const arg = argument.trim();
          if (arg.includes(":")) {
            const addresses = rangeAddresses(arg);
            if (!addresses) return "#REF!";
            values.push(...addresses.map(evaluate));
          } else if (validAddress(arg)) values.push(evaluate(arg));
          else if (arg) values.push(arithmetic(arg, evaluate));
        }
        const error = values.find((value) => typeof value === "string" && value.startsWith("#"));
        if (error) return error;
        const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
        let result: number;
        if (fn === "ROUND") {
          if (numbers.length !== 2 || !Number.isInteger(numbers[1]) || Math.abs(numbers[1]) > 15) return "#VALUE!";
          const factor = 10 ** numbers[1]; result = Math.round(numbers[0] * factor) / factor;
        } else if (fn === "ABS") { if (numbers.length !== 1) return "#VALUE!"; result = Math.abs(numbers[0]); }
        else result = fn === "COUNT" ? numbers.length : fn === "COUNTA" ? values.filter((value) => value !== "").length : fn === "SUM" ? numbers.reduce((sum, item) => sum + item, 0) : !numbers.length ? 0 : fn === "AVERAGE" ? numbers.reduce((sum, item) => sum + item, 0) / numbers.length : fn === "MIN" ? Math.min(...numbers) : Math.max(...numbers);
        if (!Number.isFinite(result)) return "#NUM!";
        expanded = expanded.slice(0, match.index) + String(result) + expanded.slice(match.index + match[0].length);
      }
      return "#LIMIT!";
    };
    let value = calculate();
    if (typeof value === "number" && !Number.isFinite(value)) value = "#NUM!";
    stack.pop(); visiting.delete(address); computed[address] = value;
    return value;
  };
  Object.keys(cells).forEach((address) => {
    try { evaluate(address); } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      visiting.clear(); stack.length = 0; computed[address] = "#LIMIT!";
    }
  });
  cycleMembers.forEach((address) => { computed[address] = "#CYCLE!"; });
  return computed;
}
