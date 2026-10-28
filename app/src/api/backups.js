import config from "../config/config";

const API = config.apiBaseUrl;

//------------------------------------------------------
// Authentication Header
//------------------------------------------------------

function getAuthHeaders() {

    const token =
        localStorage.getItem("authToken");

    return token
        ? {
            Authorization:
                `Bearer ${token}`
        }
        : {};

}

//------------------------------------------------------
// Handle Authentication Failure
//------------------------------------------------------

function checkAuth(response) {

    if (
        response.status === 401 ||
        response.status === 403
    ) {

        localStorage.removeItem("authToken");

        window.location.href = "/login";

        throw new Error(
            "Authentication required. Redirecting to login."
        );

    }

}

//------------------------------------------------------
// List Backups (admin)
//------------------------------------------------------

export async function getBackups() {

    const response =
        await fetch(
            `${API}/admin/backups`,
            { headers: getAuthHeaders() }
        );

    checkAuth(response);

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Could not load backups.");
    }

    // offsite: Google Drive copy status (#22).
    return { backups: data.backups, offsite: data.offsite };

}

//------------------------------------------------------
// Download One Backup (admin)
//
// Fetched with the auth header, then saved through a
// temporary link; a plain <a href> cannot send the token.
//------------------------------------------------------

export async function downloadBackup(file) {

    const response =
        await fetch(
            `${API}/admin/backups/${encodeURIComponent(file)}`,
            { headers: getAuthHeaders() }
        );

    checkAuth(response);

    if (!response.ok) {
        throw new Error(`Download failed (${response.status}).`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = file;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

}
