import { useEffect, useState } from "react";

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    FormControlLabel,
    Checkbox
} from "@mui/material";

export default function AddWorkCenterDialog({

    open,
    productionLine,
    onClose,
    onSave

}) {

    const [name, setName] = useState("");
    const [active, setActive] = useState(true);

    useEffect(() => {

        if (open) {

            setName("");
            setActive(true);

        }

    }, [open]);

    function handleSave() {

        onSave({

            name,

            production_line_id: productionLine.id,

            facility: productionLine.facility,

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
                Add Work Center
            </DialogTitle>

            <DialogContent>

                <TextField
                    fullWidth
                    label="Work Center Name"
                    value={name}
                    onChange={(e)=>setName(e.target.value)}
                    sx={{ mt:2 }}
                />

                <TextField
                    fullWidth
                    disabled
                    label="Production Line"
                    value={productionLine?.name || ""}
                    sx={{ mt:2 }}
                />

                <FormControlLabel
                    sx={{ mt:2 }}
                    control={
                        <Checkbox
                            checked={active}
                            onChange={(e)=>setActive(e.target.checked)}
                        />
                    }
                    label="Active"
                />

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