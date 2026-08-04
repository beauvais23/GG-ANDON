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

                Delete Production Line

            </DialogTitle>

            <DialogContent>

                <DialogContentText>

                    Are you sure you want to delete

                    <br />
                    <br />

                    <strong>

                        {line?.name}

                    </strong>

                    ?

                    <br />
                    <br />

                    This action cannot be undone.

                </DialogContentText>

            </DialogContent>

            <DialogActions>

                <Button onClick={onClose}>

                    Cancel

                </Button>

                <Button

                    color="error"

                    variant="contained"

                    onClick={onDelete}

                >

                    Delete

                </Button>

            </DialogActions>

        </Dialog>

    );

}