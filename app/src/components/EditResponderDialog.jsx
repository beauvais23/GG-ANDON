import { useEffect, useState } from "react";

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    MenuItem
} from "@mui/material";

const departments = [
    "Leadership",
    "Operations",
    "Engineering",
    "Quality",
    "Safety",
    "Inventory",
    "Maintenance"
];

const availabilityOptions = [
    "Available",
    "Busy",
    "Away"
];

export default function EditResponderDialog({

    open,
    responder,
    onClose,
    onSave

}) {

    const [name, setName] = useState("");
    const [department, setDepartment] = useState("");
    const [jobTitle, setJobTitle] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [availability, setAvailability] =
        useState("Available");

    useEffect(() => {

        if (responder) {

            setName(responder.name || "");
            setDepartment(responder.department || "");
            setJobTitle(responder.job_title || "");
            setPhone(responder.phone || "");
            setEmail(responder.email || "");
            setAvailability(
                responder.availability || "Available"
            );

        }

    }, [responder]);

    function handleSave() {

        onSave({

            ...responder,

            name,
            department,
            job_title: jobTitle,
            phone,
            email,
            availability

        });

    }

    return (

        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
        >

            <DialogTitle>

                Edit Responder

            </DialogTitle>

            <DialogContent>

                <TextField
                    fullWidth
                    margin="normal"
                    label="Name"
                    value={name}
                    onChange={(e) =>
                        setName(e.target.value)
                    }
                />

                <TextField
                    select
                    fullWidth
                    margin="normal"
                    label="Department"
                    value={department}
                    onChange={(e) =>
                        setDepartment(e.target.value)
                    }
                >

                    {departments.map((d) => (

                        <MenuItem
                            key={d}
                            value={d}
                        >

                            {d}

                        </MenuItem>

                    ))}

                </TextField>

                <TextField
                    fullWidth
                    margin="normal"
                    label="Job Title"
                    value={jobTitle}
                    onChange={(e) =>
                        setJobTitle(e.target.value)
                    }
                />

                <TextField
                    fullWidth
                    margin="normal"
                    label="Phone"
                    value={phone}
                    onChange={(e) =>
                        setPhone(e.target.value)
                    }
                />

                <TextField
                    fullWidth
                    margin="normal"
                    label="Email"
                    value={email}
                    onChange={(e) =>
                        setEmail(e.target.value)
                    }
                />

                <TextField
                    select
                    fullWidth
                    margin="normal"
                    label="Status"
                    value={availability}
                    onChange={(e) =>
                        setAvailability(e.target.value)
                    }
                >

                    {availabilityOptions.map((status) => (

                        <MenuItem
                            key={status}
                            value={status}
                        >

                            {status}

                        </MenuItem>

                    ))}

                </TextField>

            </DialogContent>

            <DialogActions>

                <Button onClick={onClose}>

                    Cancel

                </Button>

                <Button
                    variant="contained"
                    onClick={handleSave}
                >

                    Save Changes

                </Button>

            </DialogActions>

        </Dialog>

    );

}