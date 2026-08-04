import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Button,
    Typography
} from "@mui/material";

export default function DeleteResponderDialog({

    open,
    responder,
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

                Delete Responder

            </DialogTitle>

            <DialogContent>

                <DialogContentText>

                    Are you sure you want to permanently remove this responder?

                </DialogContentText>

                <Typography
                    sx={{
                        mt: 3,
                        fontWeight: 700
                    }}
                >

                    {responder?.name}

                </Typography>

                <Typography
                    sx={{
                        color: "text.secondary"
                    }}
                >

                    {responder?.role}

                </Typography>

            </DialogContent>

            <DialogActions>

                <Button
                    onClick={onClose}
                >

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