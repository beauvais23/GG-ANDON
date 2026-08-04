import { useEffect, useState } from "react";

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    FormControlLabel,
    Checkbox,
    Stack
} from "@mui/material";

export default function EditWorkCenterDialog({

    open,
    workCenter,
    onClose,
    onSave

}) {

    const [name, setName] = useState("");
    const [facility, setFacility] = useState("");
    const [displayOrder, setDisplayOrder] = useState(0);
    const [active, setActive] = useState(true);

    useEffect(() => {

        if (workCenter) {

            setName(workCenter.name);
            setFacility(workCenter.facility || "");
            setDisplayOrder(workCenter.display_order || 0);
            setActive(Boolean(workCenter.active));

        }

    }, [workCenter]);

    function handleSave() {

        onSave({

            ...workCenter,

            name,
            facility,
            display_order: Number(displayOrder),
            active

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
                Edit Work Center
            </DialogTitle>

            <DialogContent>

                <Stack spacing={2} sx={{ mt: 1 }}>

                    <TextField
                        label="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        fullWidth
                    />

                    <TextField
                        label="Facility"
                        value={facility}
                        onChange={(e) => setFacility(e.target.value)}
                        fullWidth
                    />

                    <TextField
                        label="Display Order"
                        type="number"
                        value={displayOrder}
                        onChange={(e) => setDisplayOrder(e.target.value)}
                        fullWidth
                    />

                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={active}
                                onChange={(e) =>
                                    setActive(e.target.checked)
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
                    onClick={handleSave}
                >
                    Save
                </Button>

            </DialogActions>

        </Dialog>

    );

}