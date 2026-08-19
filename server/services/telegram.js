const { supervisorUrl } = require("../config");

const {
    alertIcons,
    getElapsed,
    formatDate
} = require("./alertFormatter");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

console.log("====================================");
console.log("TELEGRAM CONFIGURATION");
console.log("====================================");
console.log("TELEGRAM_BOT_TOKEN present:", !!TOKEN);
console.log("TELEGRAM_CHAT_ID present:", !!CHAT_ID);
console.log("====================================");


//------------------------------------------------------
// Build Telegram Message
//------------------------------------------------------

function buildMessage(alert, status) {

    const responder =
        alert.assigned_to ||
        alert.acknowledged_by ||
        alert.resolved_by ||
        "Awaiting Response";

    const priority =
        alert.priority || "NORMAL";

    const priorityIcon =
        priority === "CRITICAL"
            ? "🔴"
            : priority === "HIGH"
            ? "🟠"
            : "🟢";

    const line =
        alert.production_line || alert.productionLine;

    const workCenter =
        alert.work_center || alert.workCenter;

    const resolution =
        alert.resolution_notes || "";

    let message = `

   
<b>G&G INDUSTRIAL LIGHTING</b>
<i>Production Response Center</i>

______________________________

<b>${alertIcons[alert.type]} ${alert.type} ALERT</b>

______________________________
`;

    //--------------------------------------------------
    // Status Banner
    //--------------------------------------------------

    switch (status) {

    case "CREATED":
    case "ACTIVE":

        message += `
🚨 <b>ACTIVE</b>
`;

        break;

        case "ACKNOWLEDGED":

            message += `
👷 <b>ACKNOWLEDGED</b>
`;

            break;

        case "RESOLVED":

            message += `
✅ <b>RESOLVED</b>
`;

            break;

        default:

            message += `
❌ <b>CANCELLED</b>
`;

    }

    message += `
______________________________

📍 <b>${line}</b>

🏗 <b>${workCenter}</b>

${priorityIcon} <b>${priority}</b>

______________________________
`;

    //--------------------------------------------------
    // Response Summary
    //--------------------------------------------------
    message += `
👤 <b>${responder}</b>
`;

    if (status === "CREATED") {

        message += `⏱ Open <b>${getElapsed(alert)}</b>\n`;

    }

    if (status === "ACKNOWLEDGED") {

        message += `⚡ Response <b>${getElapsed(alert)}</b>\n`;

    }

    if (status === "RESOLVED") {

        message += `⚡ Response <b>${getElapsed(alert)}</b>\n`;

        if (alert.resolved) {

            const totalSeconds =
                Math.floor(
                    (Number(alert.resolved) - Number(alert.requested)) / 1000
                );

            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;

            message += `🏁 Resolution <b>${minutes}m ${seconds}s</b>\n`;

        }

    }

    message += `
______________________________

🕒 <b>TIMELINE</b>

`;

    //--------------------------------------------------
    // Created
    //--------------------------------------------------

    message += `Created ........ <b>${formatDate(alert.requested)}</b>\n`;

    //--------------------------------------------------
    // Acknowledged
    //--------------------------------------------------

    if (alert.acknowledged) {

        message += `Acknowledged ... <b>${formatDate(alert.acknowledged)}</b>\n`;

    }

    //--------------------------------------------------
    // Resolved
    //--------------------------------------------------

    if (alert.resolved) {

        message += `Resolved ....... <b>${formatDate(alert.resolved)}</b>\n`;
    }

    //--------------------------------------------------
    // Resolution Section
    //--------------------------------------------------

    if (resolution && resolution.trim() !== "") {

        message += `
______________________________

📝 <b>RESOLUTION</b>

${resolution}

`;

    }

    //--------------------------------------------------
    // Resolved By
    //--------------------------------------------------

    if (alert.resolved_by) {

        message += `Resolved By ..... <b>${alert.resolved_by}</b>\n`;
    }

    //--------------------------------------------------
    // Acknowledged By
    //--------------------------------------------------

    else if (alert.acknowledged_by) {

        message += `Responder ....... <b>${alert.acknowledged_by}</b>\n`;
    }

    //--------------------------------------------------
    // Footer Divider
    //--------------------------------------------------

    message += `
______________________________

`;

    //--------------------------------------------------
    // Footer
    //--------------------------------------------------

    message += `
🏭 <b>ManufacturingOS</b>
<i>Production Response Center</i>
`;

    return message;

}

//------------------------------------------------------
// Build Telegram Keyboard
//------------------------------------------------------

function buildKeyboard(alert, status) {

    //--------------------------------------------------
    // RESOLVED
    //--------------------------------------------------

    if (status === "RESOLVED") {

        return {

            inline_keyboard: [

                [

                    {

                        text: "✅ RESOLVED",

                        callback_data: "resolved"

                    }

                ],

                [

                    {

                        text: "🖥 OPEN MANUFACTURINGOS",

                        url: supervisorUrl

                    }

                ]

            ]

        };

    }

    //--------------------------------------------------
    // ACKNOWLEDGED
    //--------------------------------------------------

    if (status === "ACKNOWLEDGED") {

        return {

            inline_keyboard: [

                [

                    {

                        text: "✔ Resolve Alert",

                        callback_data: `resolve_${alert.id}`

                    }

                ],
                [

                    {

                        text: "🖥 OPEN MANUFACTURINGOS",

                        url: supervisorUrl

                    }

                ]

            ]

        };

    }

    //--------------------------------------------------
    // ACTIVE / CREATED
    //--------------------------------------------------

    return {

        inline_keyboard: [

            [

                {

                    text: "👷 Acknowledge",

                    callback_data: `ack_${alert.id}`

                }

            ],

            [

                {

                    text: "🖥 OPEN MANUFACTURINGOS",

                    url: supervisorUrl

                }

            ]

        ]

    };

}

//------------------------------------------------------
// Send Telegram
//------------------------------------------------------

async function sendTelegram(alert, status) {

    if (!TOKEN || !CHAT_ID) {

        console.log("Telegram disabled.");

        return null;

    }

    try {

        const payload = {

            chat_id: CHAT_ID,

            text: buildMessage(alert, status),

            parse_mode: "HTML",

            reply_markup: buildKeyboard(alert, status)

        };

        console.log("------------------------------------");
        console.log("Sending Telegram Notification");
        console.log("------------------------------------");
        console.log(JSON.stringify(payload, null, 2));

        const response = await fetch(

            `https://api.telegram.org/bot${TOKEN}/sendMessage`,

            {

                method: "POST",

                headers: {

                    "Content-Type": "application/json"

                },

                body: JSON.stringify(payload)

            }

        );

        const result = await response.json();
        //--------------------------------------------------
        // Telegram Error
        //--------------------------------------------------

        if (!result.ok) {

            console.error("------------------------------------");
            console.error("Telegram Error");
            console.error("------------------------------------");
            console.error(result);

            return null;

        }

        console.log("------------------------------------");
        console.log("Telegram Sent Successfully");
        console.log("------------------------------------");
        console.log(`Message ID: ${result.result.message_id}`);

        return result.result.message_id;

    }

    catch (err) {

        console.error("------------------------------------");
        console.error("Telegram Exception");
        console.error("------------------------------------");
        console.error(err);

        return null;

    }

}

//------------------------------------------------------
// Exports
//------------------------------------------------------

module.exports = {

    sendTelegram,
    buildMessage,
    buildKeyboard

};                  