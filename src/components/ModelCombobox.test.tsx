import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelCombobox } from "./ModelCombobox";

// Modell-/KB-Liste mocken, damit kein echter /api/models-Call passiert.
vi.mock("../data/models", () => ({
  fetchModels: vi.fn(async () => [
    { id: "kb-1", name: "PE Programm", ownedBy: "justrag", created: 1 },
    { id: "kb-2", name: "MUG TESTING", ownedBy: "justrag", created: 2 },
  ]),
}));

describe("ModelCombobox", () => {
  it("stürzt bei undefined value nicht ab und zeigt ein leeres Feld", async () => {
    render(
      <ModelCombobox value={undefined as unknown as string} onChange={() => {}} />,
    );
    // ModelCombobox lädt die Modelle in einem Effekt (fetchModels, gemockt). Den
    // dadurch ausgelösten State-Update in act() abschließen, sonst warnt React
    // "update ... was not wrapped in act(...)". Der Feldwert bleibt leer.
    await act(async () => {});
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("zeigt den Klarnamen statt der kb-ID an, sobald die Modelle geladen sind", async () => {
    render(<ModelCombobox value="kb-1" onChange={() => {}} />);
    // Anfangs steht die ID drin, nach dem Laden der Name.
    expect(await screen.findByDisplayValue("PE Programm")).toBeInTheDocument();
  });

  it("meldet beim Auswählen die ID (nicht den Namen) an onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ModelCombobox value="" onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));

    const option = await screen.findByRole("option", { name: /MUG TESTING/ });
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith("kb-2");
  });

  it("filtert die Liste nach eingetipptem Text", async () => {
    const user = userEvent.setup();
    render(<ModelCombobox value="" onChange={() => {}} />);

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.type(input, "MUG");

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /MUG TESTING/ })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /PE Programm/ })).not.toBeInTheDocument();
    });
  });
});
