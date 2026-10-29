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

                Archive Responder

            </DialogTitle>

            <DialogContent>

                <DialogContentText>

                    Archive this responder? They disappear from the
                    responder lists. Their alert history is kept, and
                    you can restore them from Archived responders at
                    the bottom of this page.

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