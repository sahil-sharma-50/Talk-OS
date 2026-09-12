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
    const raw = cells[address]?.value ?? "";
    if (typeof raw === "number" || !String(raw).startsWith("=")) return raw;
    visiting.add(address); stack.push(address);
    const expression = String(raw).slice(1).trim().toUpperCase();
    const functionMatch = /^(SUM|AVERAGE|MIN|MAX|COUNT)\(([^)]+)\)$/.exec(expression);
    let value: SheetComputedValue;
    if (functionMatch) {
      const addresses = rangeAddresses(functionMatch[2]);
      if (!addresses) value = "#REF!";
      else {
        const resolved = addresses.map(evaluate);
        const error = resolved.find((item) => typeof item === "string" && item.startsWith("#"));
        if (error) value = error;
        else {
          const numbers = resolved.map(Number).filter(Number.isFinite);
          const fn = functionMatch[1];
          value = fn === "COUNT" ? numbers.length : fn === "SUM" ? numbers.reduce((sum, item) => sum + item, 0)
            : !numbers.length ? 0 : fn === "AVERAGE" ? numbers.reduce((sum, item) => sum + item, 0) / numbers.length
            : fn === "MIN" ? Math.min(...numbers) : Math.max(...numbers);
        }
      }
    } else if (/^[A-Z]+\(/.test(expression)) value = "#NAME?";
    else value = arithmetic(expression, evaluate);
    stack.pop(); visiting.delete(address); computed[address] = value;
    return value;
  };
  Object.keys(cells).forEach(evaluate);
  cycleMembers.forEach((address) => { computed[address] = "#CYCLE!"; });
  return computed;
}
