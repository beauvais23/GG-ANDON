// CSV download for report tables (opens in Excel / Google Sheets).
export function downloadCsv(filename, columns, rows) {

    const cell = v => {

        const s = v === null || v === undefined ? "" : String(v);

        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

    };

    const text = [columns.map(c => cell(c.label)).join(","), ...rows.map(r => columns.map(c => cell(typeof c.value === "function" ? c.value(r) : r[c.key])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });

    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

}
