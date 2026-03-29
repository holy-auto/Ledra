// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DataTable, { type Column } from "../DataTable";

interface TestRow {
  id: string;
  name: string;
  status: string;
}

const columns: Column<TestRow>[] = [
  { key: "name", header: "Name", render: (row) => row.name },
  { key: "status", header: "Status", render: (row) => row.status },
];

const sampleData: TestRow[] = [
  { id: "1", name: "Alice", status: "Active" },
  { id: "2", name: "Bob", status: "Inactive" },
  { id: "3", name: "Charlie", status: "Active" },
];

const rowKey = (row: TestRow) => row.id;

describe("DataTable", () => {
  it("renders column headers", () => {
    render(<DataTable columns={columns} data={sampleData} rowKey={rowKey} />);
    // Both desktop and mobile views render headers, so use getAllByText
    expect(screen.getAllByText("Name").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Status").length).toBeGreaterThanOrEqual(1);
  });

  it("renders row data", () => {
    render(<DataTable columns={columns} data={sampleData} rowKey={rowKey} />);
    // Data appears in both desktop table and mobile card view
    expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Bob").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Charlie").length).toBeGreaterThanOrEqual(1);
  });

  it("renders default empty message when data is empty", () => {
    render(<DataTable columns={columns} data={[]} rowKey={rowKey} />);
    // Empty message appears in both desktop and mobile views
    expect(screen.getAllByText("データがありません").length).toBeGreaterThanOrEqual(1);
  });

  it("renders custom empty message", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        rowKey={rowKey}
        emptyMessage="No results found"
      />,
    );
    expect(screen.getAllByText("No results found").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onRowClick when a row is clicked", () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={sampleData}
        rowKey={rowKey}
        onRowClick={onRowClick}
      />,
    );
    // Click the first occurrence of "Alice"
    fireEvent.click(screen.getAllByText("Alice")[0]);
    expect(onRowClick).toHaveBeenCalledWith(sampleData[0]);
  });

  it("renders sortable column header with click handler", () => {
    const sortableColumns: Column<TestRow>[] = [
      { key: "name", header: "Name", render: (row) => row.name, sortable: true },
      { key: "status", header: "Status", render: (row) => row.status },
    ];
    const { container } = render(
      <DataTable columns={sortableColumns} data={sampleData} rowKey={rowKey} />,
    );
    const nameHeader = container.querySelector("th.cursor-pointer");
    expect(nameHeader).not.toBeNull();
  });

  it("renders checkboxes when selectable", () => {
    const { container } = render(
      <DataTable
        columns={columns}
        data={sampleData}
        rowKey={rowKey}
        selectable
        selectedKeys={new Set<string>()}
        onSelectionChange={() => {}}
      />,
    );
    // "select all" checkbox + one per row in desktop, plus mobile checkboxes
    const checkboxes = container.querySelectorAll("input[type='checkbox']");
    expect(checkboxes.length).toBeGreaterThanOrEqual(4);
  });

  it("calls onSelectionChange when a row checkbox is toggled", () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <DataTable
        columns={columns}
        data={sampleData}
        rowKey={rowKey}
        selectable
        selectedKeys={new Set<string>()}
        onSelectionChange={onSelectionChange}
      />,
    );
    // Get the first row checkbox (skip the header "select all")
    const checkboxes = container.querySelectorAll(
      "table input[type='checkbox']",
    );
    // checkboxes[0] is select-all, checkboxes[1] is first row
    fireEvent.click(checkboxes[1]);
    expect(onSelectionChange).toHaveBeenCalled();
  });

  it("toggles all when select-all checkbox is clicked", () => {
    const onSelectionChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={sampleData}
        rowKey={rowKey}
        selectable
        selectedKeys={new Set<string>()}
        onSelectionChange={onSelectionChange}
      />,
    );
    const selectAll = screen.getByLabelText("すべて選択");
    fireEvent.click(selectAll);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["1", "2", "3"]));
  });

  it("renders bulk actions bar when items are selected", () => {
    const onAction = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={sampleData}
        rowKey={rowKey}
        selectable
        selectedKeys={new Set(["1", "2"])}
        onSelectionChange={() => {}}
        bulkActions={[{ label: "Delete", variant: "danger", onAction }]}
      />,
    );
    expect(screen.getByText("2件選択中")).toBeDefined();
    expect(screen.getByText("Delete")).toBeDefined();
  });

  it("calls bulk action with selected keys", () => {
    const onAction = vi.fn();
    const selected = new Set(["1"]);
    render(
      <DataTable
        columns={columns}
        data={sampleData}
        rowKey={rowKey}
        selectable
        selectedKeys={selected}
        onSelectionChange={() => {}}
        bulkActions={[{ label: "Archive", onAction }]}
      />,
    );
    fireEvent.click(screen.getByText("Archive"));
    expect(onAction).toHaveBeenCalledWith(selected);
  });
});
