"use strict";

const lines = text => text === "" ? [] : text.split("\n");

function compare(before, after) {
  const changes = [];
  let start = 0;
  let endBefore = before.length;
  let endAfter = after.length;
  while (start < endBefore && start < endAfter && before[start] === after[start]) {
    changes.push(["same", before[start++]]);
  }
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }

  const height = endBefore - start;
  const width = endAfter - start;
  const stride = width + 1;
  // Bound the table so large, unrelated inputs remain usable.
  const coarse = height > 0 && width > 0 && (height + 1) * stride > 4_000_000;
  let left = start;
  let right = start;
  if (height && width && !coarse) {
    const matches = new Uint32Array((height + 1) * stride);
    for (let i = height - 1; i >= 0; i--) {
      for (let j = width - 1; j >= 0; j--) {
        const cell = i * stride + j;
        matches[cell] = before[start + i] === after[start + j]
          ? 1 + matches[cell + stride + 1]
          : Math.max(matches[cell + 1], matches[cell + stride]);
      }
    }
    while (left < endBefore && right < endAfter) {
      const cell = (left - start) * stride + right - start;
      if (before[left] === after[right]) {
        changes.push(["same", before[left++]]);
        right++;
      } else if (matches[cell + stride] >= matches[cell + 1]) {
        changes.push(["removed", before[left++]]);
      } else {
        changes.push(["added", after[right++]]);
      }
    }
  }
  while (left < endBefore) changes.push(["removed", before[left++]]);
  while (right < endAfter) changes.push(["added", after[right++]]);
  while (left < before.length) changes.push(["same", before[left++]]);
  return { changes, coarse };
}

const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\r": "&#13;", "\0": "␀" };
const escapeHTML = text => text.replace(/[&<>\r\0]/g, character => entities[character]);

function report(before, after) {
  const { changes, coarse } = compare(lines(before), lines(after));
  let originalLine = 0;
  let updatedLine = 0;
  let additions = 0;
  let removals = 0;
  const rows = changes.map(([kind, value]) => {
    const oldNumber = kind === "added" ? "" : ++originalLine;
    const newNumber = kind === "removed" ? "" : ++updatedLine;
    if (kind === "added") additions++;
    if (kind === "removed") removals++;
    const marker = { same: "", added: "+", removed: "−" }[kind];
    return `<tr class="${kind}"><td>${oldNumber}</td><td>${newNumber}</td><td aria-label="${kind}">${marker}</td><td><code>${escapeHTML(value)}</code></td></tr>`;
  }).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Text Diff Report</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f8f5;color:#162724;font:1rem system-ui,sans-serif}
main{max-width:1150px;margin:auto;padding:40px 20px}h1{margin:0;letter-spacing:-.04em}
.summary{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 25px}.summary span{padding:6px 10px;border-radius:6px;font-size:.9rem;font-weight:650}
.added{background:#e5f5eb;color:#155738}.removed{background:#fce9e9;color:#842b31}
.table-wrap{border:1px solid #d4dfda;border-radius:10px;overflow:auto;background:white}
table{width:100%;border-collapse:collapse;text-align:left}td,th{padding:5px 10px;vertical-align:top}
th{background:#edf2ee;font-size:.78rem}td{border-top:1px solid #16272415}
td:nth-child(-n+3){width:1%;white-space:nowrap;text-align:right;font: .83rem/1.5 ui-monospace,monospace}
code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;min-height:1.5em;font:.87rem/1.5 ui-monospace,monospace;tab-size:4}
</style></head><body><main><h1>Text Diff Report</h1>
<div class="summary"><span class="added">+ ${additions} added</span><span class="removed">− ${removals} removed</span></div>
${coarse ? "<p>The changed section is large, so it is shown as one replacement.</p>" : ""}
${additions || removals ? "" : "<p>The two texts are identical.</p>"}
<div class="table-wrap"><table aria-label="Line-by-line comparison">
<thead><tr><th scope="col">Original</th><th scope="col">Updated</th><th scope="col">Change</th><th scope="col">Text</th></tr></thead>
<tbody>${rows}</tbody></table></div></main></body></html>`;
}

const form = document.querySelector("#comparison");
const original = document.querySelector("#original");
const updated = document.querySelector("#updated");
const status = document.querySelector("#status");

function updateControls() {
  for (const input of [original, updated]) {
    const count = lines(input.value).length;
    document.querySelector(`#${input.id}-count`).textContent = `${count} ${count === 1 ? "line" : "lines"}`;
  }
  for (const button of form.querySelectorAll("button")) {
    button.disabled = !original.value && !updated.value;
  }
  status.textContent = "";
}

form.addEventListener("input", updateControls);
form.addEventListener("submit", event => {
  event.preventDefault();
  const download = event.submitter?.name === "download";
  const file = new Blob([report(original.value, updated.value)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  if (download) link.download = "diff-report.html";
  else {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  status.textContent = download ? "HTML download requested." : "Report requested in a new tab.";
});
updateControls();
