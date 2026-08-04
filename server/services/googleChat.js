const axios = require("axios");
const { supervisorUrl } = require("../config");
const {
    formatDate,
    formatElapsed
} = require("./notificationFormatter");

//------------------------------------------------------
// Google Chat Card
//------------------------------------------------------

async function sendGoogleChatCard(alert, event) {

    const webhook = process.env.GOOGLE_CHAT_WEBHOOK;

    if (!webhook) {

        console.warn("Google Chat webhook not configured.");
        return;

    }

//------------------------------------------------------
// Alert Type Colors
//------------------------------------------------------

const alertEmoji = {

    QUALITY: "🔴",
    MAINTENANCE: "🟧",
    MATERIAL: "🟨",
    SUPERVISOR: "🟦",
    SAFETY: "🟩"

};

//------------------------------------------------------
// Event Status
//------------------------------------------------------

const status = {

    CREATED: "ACTIVE",
    ACKNOWLEDGED: "ACKNOWLEDGED",
    RESOLVED: "RESOLVED",
    CANCELLED: "CANCELLED"

};

//------------------------------------------------------
// Responder
//------------------------------------------------------

const responder =
    alert.assigned_to ||
    alert.acknowledged_by ||
    alert.resolved_by ||
    "Unassigned";

//------------------------------------------------------
// Payload
//------------------------------------------------------

const payload = {

    cardsV2: [

        {

            cardId: `alert-${alert.id}`,

            card: {

                //--------------------------------------------------
                // Executive Header
                //--------------------------------------------------

                header: {

    title:
        `${alertEmoji[alert.type] || "⚪"} ${alert.type} ALERT`

},

                sections: [  
                    
//--------------------------------------------------
// Company Banner
//--------------------------------------------------

{

    widgets: [

        {

            textParagraph: {

                text:
                    "<b>G&G INDUSTRIAL LIGHTING</b><br><i>ManufacturingOS • Production Response Center</i>"

            }

        }

    ]

},                    

//--------------------------------------------------
// Executive Status
//--------------------------------------------------

{

    widgets: [

        {

            decoratedText: {

                startIcon: {

                    knownIcon: "DESCRIPTION"

                },

                topLabel: "CURRENT STATUS",

                text: `<b>${status[event]}</b>`

            }

        }

    ]

},

//--------------------------------------------------
// Production Location
//--------------------------------------------------

{

    header: "Production Location",

    widgets: [

        

        {

            decoratedText: {

                startIcon: {

                    knownIcon: "MULTIPLE_PEOPLE"

                },

                text: `<b>${
                    alert.productionLine ||
                    alert.production_line
                }</b>`

            }

        },

        {

            decoratedText: {

                startIcon: {

                    knownIcon: "DESCRIPTION"

                },

                text: `<b>${
                    alert.workCenter ||
                    alert.work_center
                }</b>`

            }

        }

    ]

},

//--------------------------------------------------
// Executive Response Summary
//--------------------------------------------------

{

    header: "Response",

    widgets: [

        {

            decoratedText: {

                startIcon: {

                    knownIcon: "PERSON"

                },

                text: `<b>${responder}</b>`

            }

        },

        {

            decoratedText: {

                text:
                    `${alert.priority === "CRITICAL"
                        ? "🔴"
                        : alert.priority === "HIGH"
                        ? "🟠"
                        : "🟢"} <b>${alert.priority || "NORMAL"} PRIORITY</b>`

            }

        },

        {

            decoratedText: {

                text:
                    `⚡ <b>Response</b>  ${formatElapsed(alert)}`

            }

        },

        ...(alert.resolved
            ? [

                {

                    decoratedText: {

                        text:
                            `🏁 <b>Resolution</b>  ${formatElapsed({
                                requested: alert.requested,
                                resolved: alert.resolved
                            })}`

                    }

                }

            ]
            : [])

    ]

},


                        //--------------------------------------------------
                        // Resolution Notes
                        //--------------------------------------------------

                        ...(alert.resolution_notes
                            ? [

                                {

                                    header: "Resolution",

                                    widgets: [

                                        {

                                            textParagraph: {

                                                text:
                                                    alert.resolution_notes

                                            }

                                        }

                                    ]

                                }

                            ]
                            : []),

                        //--------------------------------------------------
                        // Actions
                        //--------------------------------------------------

                        {

                            widgets: [

                                {

                                    buttonList: {

                                        buttons: [

                                            {

                                                text: "OPEN MANUFACTURINGOS",

                                                onClick: {

                                                    openLink: {

                                                        url: supervisorUrl

                                                    }

                                                }

                                            }

                                        ]

                                    }

                                }

                            ]

                        }

                    ]

                }

            }

        ]

    };

    //--------------------------------------------------
    // Send Card
    //--------------------------------------------------

    try {

        await axios.post(webhook, payload);

        console.log("✓ Google Chat Card sent.");

    }

    catch (err) {

        console.error("Google Chat Error:");

        if (err.response) {

            console.error(err.response.data);

        }
        else {

            console.error(err.message);

        }

    }

}

module.exports = {

    sendGoogleChatCard

};