import { RAG_COLORS } from "../../config/ragColors";

// BOM change highlights (same palette as the board's RAG):
// change qty = amber, delete = red, add = green.
export const CHANGE_COLORS = { CHANGE_QTY: RAG_COLORS.amber, DELETE: RAG_COLORS.red, ADD: RAG_COLORS.green };

export const CHANGE_LABELS = { CHANGE_QTY: "Change qty", DELETE: "Delete", ADD: "Add" };
