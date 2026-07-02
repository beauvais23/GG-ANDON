import config from "../config/config";

const API = config.api.baseUrl;

export async function createAlert(type) {

  const alert = {
    type,
    facility: config.facility,
    productionLine: config.productionLine,
    workCenter: config.workCenter
  };

  const response = await fetch(`${API}/alerts`, {

    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify(alert)

  });

  return await response.json();

}

export async function getAlerts() {

  const response = await fetch(`${API}/alerts`);

  return await response.json();

}

export async function getActiveAlerts() {

  const response = await fetch(`${API}/alerts/active`);

  return await response.json();

}

export async function resolveAlert(id) {

  const response = await fetch(

    `${API}/alerts/${id}/resolve`,

    {
      method: "PATCH"
    }

  );

  return await response.json();

}