import config from "../config/config";

//------------------------------------------------------
// API Base URL
//------------------------------------------------------

const API_URL = config.apiBaseUrl;

//----------------------------------------------------
// Create Alert
//----------------------------------------------------

export async function createAlert(alert) {

  const response = await fetch(`${API_URL}/alerts`, {

    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify(alert)

  });

  return response.json();

}

//------------------------------------------------------
// Get Active Alerts
//------------------------------------------------------

export async function getActiveAlerts() {

  const response = await fetch(
    `${API_URL}/alerts/active`
  );

  return response.json();

}

//------------------------------------------------------
// Get All Alerts
//------------------------------------------------------

export async function getAllAlerts() {

  const response = await fetch(
    `${API_URL}/alerts`
  );

  return response.json();

}

//------------------------------------------------------
// Acknowledge Alert
//------------------------------------------------------

export async function acknowledgeAlert(id, acknowledgedBy) {

  const response = await fetch(

    `${API_URL}/alerts/${id}/acknowledge`,

    {

      method: "PATCH",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({

        acknowledgedBy

      })

    }

  );

  return response.json();

}

//------------------------------------------------------
// Resolve Alert
//------------------------------------------------------

export async function resolveAlert(

  id,

  resolvedBy,

  resolutionNotes = ""

) {

  const response = await fetch(

    `${API_URL}/alerts/${id}/resolve`,

    {

      method: "PATCH",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({

        resolvedBy,

        resolutionNotes

      })

    }

  );

  return response.json();

}

//------------------------------------------------------
// Cancel Alert
//------------------------------------------------------

export async function cancelAlert(id) {

  const response = await fetch(

    `${API_URL}/alerts/${id}/cancel`,

    {

      method: "PATCH"

    }

  );

  return response.json();

}