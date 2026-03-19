package format

import "strings"

type Row struct {
	Mode        string
	Line        string
	Destination string
	Departs     string
	Stop        string
}

func Table(rows []Row, includeMode bool) string {
	if len(rows) == 0 {
		return ""
	}

	headers := tableHeaders(includeMode)
	data := tableRows(rows, includeMode)
	widths := tableWidths(headers, data)

	var b strings.Builder
	writeTableLine(&b, headers, widths)
	for _, row := range data {
		writeTableLine(&b, row, widths)
	}
	return b.String()
}

func tableHeaders(includeMode bool) []string {
	if includeMode {
		return []string{"MODE", "LINE", "DEST", "DEPARTS", "STOP"}
	}
	return []string{"LINE", "DEST", "DEPARTS", "STOP"}
}

func tableRows(rows []Row, includeMode bool) [][]string {
	data := make([][]string, 0, len(rows))
	for _, row := range rows {
		if includeMode {
			data = append(data, []string{row.Mode, row.Line, row.Destination, row.Departs, row.Stop})
			continue
		}
		data = append(data, []string{row.Line, row.Destination, row.Departs, row.Stop})
	}
	return data
}

func tableWidths(headers []string, rows [][]string) []int {
	widths := make([]int, len(headers))
	for i, header := range headers {
		widths[i] = len(header)
	}
	for _, row := range rows {
		for i, cell := range row {
			if len(cell) > widths[i] {
				widths[i] = len(cell)
			}
		}
	}
	return widths
}

func writeTableLine(b *strings.Builder, values []string, widths []int) {
	b.WriteString("  ")
	for i, value := range values {
		b.WriteString(padRight(value, widths[i]))
		if i+1 < len(values) {
			b.WriteString("  ")
		}
	}
	b.WriteByte('\n')
}

func padRight(value string, width int) string {
	if len(value) >= width {
		return value
	}
	return value + strings.Repeat(" ", width-len(value))
}
