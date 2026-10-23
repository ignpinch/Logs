// Utilities for exporting journal memories to an Excel workbook.
import ExcelJS from "exceljs";

export async function exportMemoriesToExcel(entries, formatDate, formatTime, prettyLanguage) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Life Log";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("My Memories", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Entry ID", key: "id", width: 38 },
    { header: "Date", key: "date", width: 16 },
    { header: "Time", key: "time", width: 14 },
    { header: "Title", key: "title", width: 30 },
    { header: "Language", key: "language", width: 14 },
    { header: "Full Journal Text", key: "text", width: 70 },
  ];
  entries.forEach(entry => sheet.addRow({ id: entry.id, date: formatDate(entry.createdAt), time: formatTime(entry.createdAt), title: entry.title || "Untitled memory", language: prettyLanguage(entry.language), text: entry.text }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF244D3B" } };
  header.alignment = { vertical: "middle" };
  header.height = 26;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true };
    row.eachCell(cell => { cell.border = { bottom: { style: "thin", color: { argb: "FFE3E8E0" } } }; });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = `life-log-${new Date().toISOString().slice(0, 10)}.xlsx`; link.click();
  URL.revokeObjectURL(url);
}
