const API = window.location.origin.replace("5173", "3001");

//------------------------------------------------------
// Get Production Lines
//------------------------------------------------------

export async function getProductionLines() {

    const response = await fetch(`${API}/production-lines`);

    if (!response.ok) {
        throw new Error("Unable to load Production Lines.");
    }

    return response.json();

}

//------------------------------------------------------
// Create Production Line
//------------------------------------------------------

export async function createProductionLine(line) {

    const response = await fetch(`${API}/production-lines`, {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify(line)

    });

    if (!response.ok) {

        const err = await response.json();

        throw new Error(
            err.message || "Unable to create Production Line."
        );

    }

    return response.json();

}

//------------------------------------------------------
// Update Production Line
//------------------------------------------------------

export async function updateProductionLine(id, line) {

    const response = await fetch(`${API}/production-lines/${id}`, {

        method: "PUT",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify(line)

    });

    if (!response.ok) {
        throw new Error("Unable to update Production Line.");
    }

    return response.json();

}

//------------------------------------------------------
// Delete Production Line
//------------------------------------------------------

export async function deleteProductionLine(id) {

    const response = await fetch(`${API}/production-lines/${id}`, {

        method: "DELETE"

    });

    if (!response.ok) {
        throw new Error("Unable to delete Production Line.");
    }

    return response.json();

}

//------------------------------------------------------
// Update Display Order
//------------------------------------------------------

export async function updateProductionLineOrder(lines) {

    const response = await fetch(`${API}/production-lines/order`, {

        method: "PUT",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify(lines)

    });

    if (!response.ok) {

        throw new Error("Unable to save Production Line order.");

    }

    return response.json();

}