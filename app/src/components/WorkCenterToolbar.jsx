import {
    Box,
    FormControl,
    InputLabel,
    MenuItem,
    Select
} from "@mui/material";

import { useWorkCenter } from "../context/WorkCenterContext";

export default function WorkCenterToolbar() {

    const {
        workCenters,
        workCenter,
        changeWorkCenter
    } = useWorkCenter();

    
    return (

        <Box
            sx={{
                p: 2,
                backgroundColor: "#ffffff"
            }}
        >

            <FormControl fullWidth>

                <InputLabel id="work-center-label">
                    Work Center
                </InputLabel>

                <Select
                    labelId="work-center-label"
                    value={workCenter}
                    label="Work Center"
                    onChange={(event) =>
                        changeWorkCenter(event.target.value)
                    }
                >

                    {workCenters.map((wc) => (

                        <MenuItem
                            key={wc.id}
                            value={wc.name}
                        >
                            {wc.name}
                        </MenuItem>

                    ))}

                </Select>

            </FormControl>

        </Box>

    );

}