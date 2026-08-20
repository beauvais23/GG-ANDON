//------------------------------------------------------
// ManufacturingOS Configuration
//------------------------------------------------------

module.exports = {

    supervisorUrl:
        process.env.SUPERVISOR_URL ||
        "https://manufacturingos-frontend-production.up.railway.app/supervisor"

};