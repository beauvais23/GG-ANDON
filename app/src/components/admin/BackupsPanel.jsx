import { useEffect, useState } from "react";

import {
    Alert,
    Box,
    Button,
    Chip,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography
} from "@mui/material";

import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";

import {
    getBackups,
    downloadBackup
} from "../../api/backups";

//------------------------------------------------------
// Helpers
//------------------------------------------------------

function backupType(file) {

    if (file.includes("-daily-")) return { label: "Daily", color: "primary" };
    if (file.includes("-before-restore")) return { label: "Before restore", color: "warning" };
    if (file.includes("-before-down-")) return { label: "Before rollback", color: "warning" };
    if (file.includes("-before-")) return { label: "Before migration", color: "secondary" };

    return { label: "Other", color: "default" };

}

function formatSize(bytes) {

    if (bytes < 1024 * 1024)
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;

    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;

}

function formatTime(ms) {

    return new Date(ms).toLocaleString("en-US", {
        timeZone: "America/New_York",
        dateStyle: "medium",
        timeStyle: "short"
    });

}

//------------------------------------------------------
// Backups Panel
//------------------------------------------------------

export default function BackupsPanel() {

    const [backups, setBackups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState("");
    const [error, setError] = useState("");

    async function load() {

        setLoading(true);
        setError("");

        try {

            setBackups(await getBackups());

        } catch (err) {

            setError(err.message);

        } finally {

            setLoading(false);

        }

    }

    async function handleDownload(file) {

        setDownloading(file);
        setError("");

        try {

            await downloadBackup(file);

        } catch (err) {

            setError(err.message);

        } finally {

            setDownloading("");

        }

    }

    useEffect(() => {

        load();

    }, []);

    return (

        <Paper sx={{ p: 3 }}>

            <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 1 }}
            >

                <Typography variant="h6">
                    Database Backups
                </Typography>

                <Button
                    startIcon={<RefreshIcon />}
                    onClick={load}
                    disabled={loading}
                >
                    Refresh
                </Button>

            </Stack>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                These files live on the same Railway volume as the database.
                Download one and save it to Google Drive to keep a copy off Railway.
                A daily backup is taken after 5 pm ET; the newest 14 are kept.
            </Typography>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            {!loading && backups.length === 0 && !error && (
                <Alert severity="info">
                    No backups yet.
                </Alert>
            )}

            {backups.length > 0 && (

                <Box sx={{ overflowX: "auto" }}>

                    <Table size="small">

                        <TableHead>
                            <TableRow>
                                <TableCell>Created (ET)</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>File</TableCell>
                                <TableCell align="right">Size</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>

                        <TableBody>

                            {backups.map(backup => {

                                const type = backupType(backup.file);

                                return (

                                    <TableRow key={backup.file}>

                                        <TableCell>
                                            {formatTime(backup.modified)}
                                        </TableCell>

                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={type.label}
                                                color={type.color}
                                            />
                                        </TableCell>

                                        <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                                            {backup.file}
                                        </TableCell>

                                        <TableCell align="right">
                                            {formatSize(backup.sizeBytes)}
                                        </TableCell>

                                        <TableCell align="right">
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                startIcon={<DownloadIcon />}
                                                disabled={Boolean(downloading)}
                                                onClick={() => handleDownload(backup.file)}
                                            >
                                                {downloading === backup.file ? "Downloading…" : "Download"}
                                            </Button>
                                        </TableCell>

                                    </TableRow>

                                );

                            })}

                        </TableBody>

                    </Table>

                </Box>

            )}

        </Paper>

    );

}
