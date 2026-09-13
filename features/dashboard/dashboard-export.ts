export async function downloadDashboardImage(node: HTMLElement, title: string) {
  const { toPng } = await import("html-to-image");
  const image = await toPng(node, { pixelRatio: 2, skipFonts: true, backgroundColor: getComputedStyle(node).backgroundColor, filter: (element) => !(element instanceof HTMLElement && (element.classList.contains("dashboard-layout__move") || element.classList.contains("dashboard-layout__resize") || element.tagName === "BUTTON")) });
  const anchor = document.createElement("a"); anchor.href = image; anchor.download = `${title.replace(/[<>:"/\\|?*]/g, "-") || "dashboard"}.png`; anchor.click();
}

export async function printDashboard(node: HTMLElement, title: string) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Allow pop-ups for TalkOS to open the printable dashboard.");
  popup.document.title = title;
  popup.document.body.textContent = "Preparing your dashboard…";
  try {
    const { toPng } = await import("html-to-image");
    const data = await toPng(node, { pixelRatio: 2, skipFonts: true, filter: (element) => !(element instanceof HTMLElement && element.tagName === "BUTTON") });
    popup.document.body.textContent = "";
    const style = popup.document.createElement("style"); style.textContent = "@page { size: landscape; margin: 12mm; } body { margin: 0; } img { display: block; max-width: 100%; max-height: 180mm; margin: auto; object-fit: contain; }"; popup.document.head.append(style);
    const image = popup.document.createElement("img"); image.alt = title; image.src = data; popup.document.body.append(image);
    await image.decode(); popup.focus(); popup.print();
  } catch (error) { popup.close(); throw error; }
}
