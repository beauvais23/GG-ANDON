import { useEffect, useState } from "react";

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Stack,
    FormControlLabel,
    Switch
} from "@mui/material";

export default function AddProductionLineDialog({

    open,
    onClose,
    onSave

}) {

    const [form, setForm] = useState({

        name: "",
        facility: "Malta",
        description: "",
        display_order: 1,
        color: "#1976d2",
        active: true

    });

    useEffect(() => {

        if (open) {

            setForm({

                name: "",
                facility: "Malta",
                description: "",
                display_order: 1,
                color: "#1976d2",
                active: true

            });

        }

    }, [open]);

    function update(field, value) {

        setForm({

            ...form,
            [field]: value

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

                Add Production Line

            </DialogTitle>

            <DialogContent>

                <Stack
                    spacing={2}
                    sx={{ mt: 1 }}
                >

                    <TextField
                        label="Production Line Name"
                        value={form.name}
                        onChange={(e) =>
                            update("name", e.target.value)
                        }
                        fullWidth
                    />

                    <TextField
                        label="Facility"
                        value={form.facility}
                        onChange={(e) =>
                            update("facility", e.target.value)
                        }
                        fullWidth
                    />

                    <TextField
                        label="Description"
                        value={form.description}
                        onChange={(e) =>
                            update("description", e.target.value)
                        }
                        fullWidth
                    />

                    <TextField
                        label="Display Order"
                        type="number"
                        value={form.display_order}
                        onChange={(e) =>
                            update("display_order", Number(e.target.value))
                        }
                    />

                    <TextField
                        label="Color"
                        type="color"
                        value={form.color}
                        onChange={(e) =>
                            update("color", e.target.value)
                        }
                    />

                    <FormControlLabel
                        control={
                            <Switch
                                checked={form.active}
                                onChange={(e) =>
                                    update("active", e.target.checked)
                                }
                            />
                        }
                        label="Active"
                    />

                </Stack>

            </DialogContent>

            <DialogActions>

                <Button onClick={onClose}>

                    Cancel

                </Button>

                <Button
                    variant="contained"
                    onClick={() => onSave(form)}
                >

                    Save

                </Button>

            </DialogActions>

        </Dialog>

    );

}