const API =
    window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : `${window.location.protocol}//${window.location.hostname.replace("-5173", "-3001")}`;

//------------------------------------------------------
// Get Response Team
//------------------------------------------------------

export async function getResponseTeam() {

    const response = await fetch(`${API}/response-team`);

    if (!response.ok) {
        throw new Error("Failed to load response team");
    }

    return response.json();

}

//------------------------------------------------------
// Create Responder
//------------------------------------------------------

export async function createResponder(responder) {

    const response = await fetch(`${API}/response-team`, {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify(responder)

    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message);
    }

    return data;

}

//------------------------------------------------------
// Update Responder
//------------------------------------------------------

export async function updateResponder(id, responder) {

    const response = await fetch(`${API}/response-team/${id}`, {

        method: "PUT",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify(responder)

    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message);
    }

    return data;

}

//------------------------------------------------------
// Delete Responder
//------------------------------------------------------

export async function deleteResponder(id) {

    const response = await fetch(`${API}/response-team/${id}`, {

        method: "DELETE"

    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message);
    }

    return data;

}