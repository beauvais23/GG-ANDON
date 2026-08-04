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

export default function EditProductionLineDialog({

    open,
    line,
    onClose,
    onSave

}) {

    const [form, setForm] = useState({

        name: "",
        facility: "",
        description: "",
        display_order: 1,
        color: "#1976d2",
        active: true

    });

    useEffect(() => {

        if (line) {

            setForm({

                name: line.name || "",
                facility: line.facility || "",
                description: line.description || "",
                display_order: line.display_order || 1,
                color: line.color || "#1976d2",
                active: !!line.active

            });

        }

    }, [line]);

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

                Edit Production Line

            </DialogTitle>

            <DialogContent>

                <Stack spacing={2} sx={{ mt: 1 }}>

                    <TextField
                        label="Production Line Name"
                        value={form.name}
                        onChange={(e) =>
                            update("name", e.target.value)
                        }
                    />

                    <TextField
                        label="Facility"
                        value={form.facility}
                        onChange={(e) =>
                            update("facility", e.target.value)
                        }
                    />

                    <TextField
                        label="Description"
                        value={form.description}
                        onChange={(e) =>
                            update("description", e.target.value)
                        }
                    />

                    <TextField
                        label="Display Order"
                        type="number"
                        value={form.display_order}
                        onChange={(e) =>
                            update(
                                "display_order",
                                Number(e.target.value)
                            )
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