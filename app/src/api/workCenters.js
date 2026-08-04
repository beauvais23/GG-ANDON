import config from "../config/config";

const API_URL = config.apiBaseUrl;

//------------------------------------------------------
// Get All Work Centers
//------------------------------------------------------

export async function getWorkCenters() {

    const response = await fetch(
        `${API_URL}/work-centers`
    );

    return response.json();

}

//------------------------------------------------------
// Get Work Centers by Production Line
//------------------------------------------------------

export async function getWorkCentersByProductionLine(productionLine) {

    const response = await fetch(
        `${API_URL}/work-centers/line/${encodeURIComponent(productionLine)}`
    );

    return response.json();

}

//------------------------------------------------------
// Create Work Center
//------------------------------------------------------

export async function createWorkCenter(workCenter) {

    const response = await fetch(
        `${API_URL}/work-centers`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(workCenter)
        }
    );

    return response.json();

}

//------------------------------------------------------
// Update Work Center
//------------------------------------------------------

export async function updateWorkCenter(id, workCenter) {

    const response = await fetch(

        `${API_URL}/work-centers/${id}`,

        {

            method: "PUT",

            headers: {

                "Content-Type": "application/json"

            },

            body: JSON.stringify(workCenter)

        }

    );

    if (!response.ok) {

        throw new Error("Unable to update Work Center.");

    }

    return response.json();

}

//------------------------------------------------------
// Update Work Center Display Order
//------------------------------------------------------

export async function updateWorkCenterOrder(workCenters) {

    const response = await fetch(

        `${API_URL}/work-centers/order`,

        {

            method: "PUT",

            headers: {

                "Content-Type": "application/json"

            },

            body: JSON.stringify(workCenters)

        }

    );

    if (!response.ok) {

        throw new Error(
            "Unable to save Work Center order."
        );

    }

    return response.json();

}