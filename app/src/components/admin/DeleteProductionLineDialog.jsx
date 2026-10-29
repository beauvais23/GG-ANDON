import {

    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Button

} from "@mui/material";

export default function DeleteProductionLineDialog({

    open,
    line,
    onClose,
    onDelete

}) {

    return (

        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="xs"
            fullWidth
        >

            <DialogTitle>

                Archive Production Line

            </DialogTitle>

            <DialogContent>

                <DialogContentText>

                    Archive <strong>{line?.name}</strong>?

                    <br />
                    <br />

                    It disappears from the tablets, the wallboard and
                    this list. Its alert history and work centers are
                    kept, and you can restore it from Archived lines
                    at the bottom of this page.

                </DialogContentText>

            </DialogContent>

            <DialogActions>

                <Button onClick={onClose}>

                    Cancel

                </Button>

                <Button

                    color="warning"

                    variant="contained"

                    onClick={onDelete}

                >

                    Archive

                </Button>

            </DialogActions>

        </Dialog>

    );

}