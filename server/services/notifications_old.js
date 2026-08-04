async function sendNotification(eventType, alert) {

    console.log("=======================================");
    console.log("MANUFACTURINGOS NOTIFICATION");
    console.log("=======================================");
    console.log("Event:", eventType);
    console.log("Type:", alert.type);
    console.log("Facility:", alert.facility);
    console.log("Production Line:", alert.productionLine || alert.production_line);
    console.log("Work Center:", alert.workCenter || alert.work_center);
    console.log("Responder:", alert.acknowledgedBy || alert.resolvedBy || "Unassigned");
    console.log("Status:", alert.status);
    console.log("=======================================");

}

module.exports = {
    sendNotification
};