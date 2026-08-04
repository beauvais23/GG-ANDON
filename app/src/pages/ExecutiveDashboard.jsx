import { useEffect, useState } from "react";

import {
    Box,
    Grid,
    Paper,
    Stack,
    Typography,
    Chip,
    Divider
} from "@mui/material";

import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    ReferenceLine
} from "recharts";

import Header from "../components/Header";
import useClock from "../hooks/useClock";

import { getExecutiveDashboard } from "../services/api";

export default function ExecutiveDashboard() {

    const clock = useClock();

    const [dashboard, setDashboard] = useState(null);

    async function loadDashboard() {

        try {

            const data = await getExecutiveDashboard();

            setDashboard(data);

        }

        catch (err) {

            console.error(err);

        }

    }

    useEffect(() => {

        loadDashboard();

        const timer = setInterval(loadDashboard,5000);

        return () => clearInterval(timer);

    },[]);

    if (!dashboard) {

        return (

            <Box
                sx={{
                    minHeight:"100vh",
                    bgcolor:"#EEF2F6"
                }}
            >

                <Header time={clock.time} />

                <Box sx={{p:5}}>

                    <Typography variant="h4">

                        Loading Executive Dashboard...

                    </Typography>

                </Box>

            </Box>

        );

    }

    return (
        <Box
            sx={{
                minHeight:"100vh",
                bgcolor:"#EEF2F6"
            }}
        >

            <Header time={clock.time} />

            <Box
  sx={{
    width: "100%",
    maxWidth: "100%",
    px: 4,
    py: 3,
    bgcolor: "#EEF2F6"
  }}
>

{/* ======================================= */}
{/* HERO HEADER                             */}
{/* ======================================= */}

<Paper
    elevation={5}
    sx={{
        p: 2.5,
        borderRadius: 3,
        mb: 2.5,
        background:
            "linear-gradient(135deg,#1E3A8A,#312E81)",
        color: "white"
    }}
>

    <Grid
        container
        sx={{
            alignItems: "center"
        }}
    >

        <Grid
            size={{ xs: 12, md: 8 }}
        >

            <Typography
                sx={{
                    fontSize: 46,
                    fontWeight: 800,
                    lineHeight: 1.05
                }}
            >
                Executive Operations Dashboard
            </Typography>

            <Typography
                sx={{
                    mt: 0.75,
                    fontSize: 18,
                    opacity: 0.9
                }}
            >
                Live Manufacturing Performance Analytics
            </Typography>

        </Grid>


        <Grid
    size={{ xs: 12, md: 4 }}
    sx={{
        display: "flex",
        justifyContent: {
            xs: "flex-start",
            md: "flex-end"
        },
        alignItems: "center"
    }}
>
    <Chip
        label="SYSTEM ONLINE"
        color="success"
        size="medium"
        sx={{
            fontWeight: 700,
            fontSize: 14,
            px: 1,
            py: 2.5
        }}
    />
</Grid>

    </Grid>

</Paper>


{/* ======================================= */}
{/* KPI DASHBOARD                           */}
{/* ======================================= */}

<Grid
    container
    spacing={2}
    sx={{
        mb: 2.5
    }}
>

    {[
        {
            title: "TOTAL ALERTS",
            value: dashboard.kpis.totalAlerts,
            color: "#2563EB",
            icon: "📊"
        },

        {
            title: "ACTIVE ALERTS",
            value: dashboard.kpis.activeAlerts,
            color: "#DC2626",
            icon: "🚨"
        },

        {
            title: "ACKNOWLEDGED",
            value: dashboard.kpis.acknowledgedAlerts,
            color: "#16A34A",
            icon: "✔"
        },

        {
    title:"AVG ACKNOWLEDGE",
    value:`${(
        dashboard.kpis.avgResponseSeconds / 60
    ).toFixed(1)} min`,
    color:
        dashboard.kpis.avgResponseSeconds <= 120
            ? "#16A34A"
            : "#DC2626",
    icon:
        dashboard.kpis.avgResponseSeconds <= 120
            ? "⚡"
            : "⚠️"
},

        {
            title: "AVG RESOLUTION",
            value: `${Math.round(
                dashboard.kpis.avgResolutionSeconds / 60
            )} min`,
            color: "#8B5CF6",
            icon: "⏱"
        },

        {
            title: "SYSTEM STATUS",
            value: "ONLINE",
            color: "#10B981",
            icon: "🟢"
        }

    ].map(card => (

        <Grid
            key={card.title}
            size={{
                xs: 12,
                sm: 6,
                lg: 2
            }}
        >

            <Paper
                elevation={4}
                sx={{
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 3,
                    p: 1.5,
                    height: 105,

                    transition: ".2s",

                    "&:hover": {
                        transform: "translateY(-3px)",
                        boxShadow: 7
                    }
                }}
            >

                {/* Accent Bar */}

                <Box
                    sx={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 7,
                        bgcolor: card.color
                    }}
                />


                <Stack
                    spacing={0.5}
                    sx={{
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%"
                    }}>

                    <Typography
                        sx={{
                            fontSize: 27,
                            lineHeight: 1
                        }}
                    >
                        {card.icon}
                    </Typography>


                    <Typography
                        sx={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "text.secondary",
                            lineHeight: 1
                        }}
                    >
                        {card.title}
                    </Typography>


                    <Typography
                        sx={{
                            fontSize: 29,
                            fontWeight: 800,
                            color: card.color,
                            lineHeight: 1
                        }}
                    >
                        {card.value}
                    </Typography>

                </Stack>

            </Paper>

        </Grid>

    ))}

</Grid>


{/* ====================================================== */}
{/* EXECUTIVE ANALYTICS                                   */}
{/* ====================================================== */}

<Grid
    container
    spacing={2}
>

    {/* ================================================== */}
    {/* ALERT PARETO                                      */}
    {/* ================================================== */}

    <Grid
        size={{
            xs: 12,
            sm: 6,
            lg: 3
        }}
    >

        <Paper
            elevation={4}
            sx={{
                p: 1.5,
                borderRadius: 3,
                height: 425,
                overflow: "hidden"
            }}
        >

            <Typography
                sx={{
                    fontSize: 18,
                    fontWeight: 700,
                    mb: 0.5
                }}
            >
                Alert Pareto
            </Typography>


            <ResponsiveContainer
                width="100%"
                height={360}
            >

                <BarChart
                    data={dashboard.pareto}
                    margin={{
                        top: 5,
                        right: 5,
                        left: -15,
                        bottom: 5
                    }}
                >

                    <CartesianGrid
                        strokeDasharray="3 3"
                    />

                    <XAxis
                        dataKey="type"
                        tick={{
                            fontSize: 10
                        }}
                    />

                    <YAxis
                        tick={{
                            fontSize: 10
                        }}
                    />

                    <Tooltip />

                    <Bar
                        dataKey="total"
                        fill="#2563EB"
                        radius={[5, 5, 0, 0]}
                    />

                </BarChart>

            </ResponsiveContainer>

        </Paper>

    </Grid>


    {/* ================================================== */}
    {/* MONTHLY ALERT TREND                               */}
    {/* ================================================== */}

    <Grid
        size={{
            xs: 12,
            sm: 6,
            lg: 3
        }}
    >

        <Paper
            elevation={4}
            sx={{
                p: 1.5,
                borderRadius: 3,
                height: 425,
                overflow: "hidden"
            }}
        >

            <Typography
                sx={{
                    fontSize: 18,
                    fontWeight: 700,
                    mb: 0.5
                }}
            >
                Monthly Alert Trend
            </Typography>


            <ResponsiveContainer
                width="100%"
                height={360}
            >

                <BarChart
                    data={dashboard.monthlyTrend}
                    margin={{
                        top: 5,
                        right: 5,
                        left: -15,
                        bottom: 5
                    }}
                >

                    <CartesianGrid
                        strokeDasharray="3 3"
                    />

                    <XAxis
                        dataKey="month"
                        tick={{
                            fontSize: 10
                        }}
                    />

                    <YAxis
                        tick={{
                            fontSize: 10
                        }}
                    />

                    <Tooltip />

                    <Bar
                        dataKey="total"
                        fill="#16A34A"
                        radius={[5, 5, 0, 0]}
                    />

                </BarChart>

            </ResponsiveContainer>

        </Paper>

    </Grid>


{/* ================================================== */}
{/* AVERAGE ACKNOWLEDGE TIME                           */}
{/* ================================================== */}

<Grid
    size={{
        xs: 12,
        sm: 6,
        lg: 3
    }}
>

    <Paper
        elevation={4}
        sx={{
            p: 1.5,
            borderRadius: 3,
            height: 425,
            overflow: "hidden"
        }}
    >

        <Typography
            sx={{
                fontSize: 18,
                fontWeight: 700,
                mb: 0.5
            }}
        >
            Average Acknowledge Time
        </Typography>


        <ResponsiveContainer
            width="100%"
            height={360}
        >

            <LineChart
                data={dashboard.responseTrend}
                margin={{
                    top: 10,
                    right: 5,
                    left: -15,
                    bottom: 5
                }}
            >

                <CartesianGrid
                    strokeDasharray="3 3"
                />

                <XAxis
                    dataKey="month"
                    tick={{
                        fontSize: 10
                    }}
                />

                <YAxis
                    tick={{
                        fontSize: 10
                    }}
                    tickFormatter={(value) =>
                        `${Math.round(value / 60)}`
                    }
                />

                <Tooltip
                    formatter={(value) => [
                        `${(value / 60).toFixed(1)} min`,
                        "Acknowledge Time"
                    ]}
                />

                {/* 2 MINUTE TARGET */}

                <ReferenceLine
                    y={120}
                    stroke="#DC2626"
                    strokeDasharray="6 4"
                    strokeWidth={2}
                    label={{
                        value: "Target ≤ 2 min",
                        position: "insideTopRight",
                        fill: "#DC2626",
                        fontSize: 10,
                        fontWeight: 700
                    }}
                />

                <Line
                    type="monotone"
                    dataKey="responseSeconds"
                    stroke="#F59E0B"
                    strokeWidth={3}
                    dot={{
                        r: 4
                    }}
                    activeDot={{
                        r: 6
                    }}
                />

            </LineChart>

        </ResponsiveContainer>

    </Paper>

</Grid>


{/* ================================================== */}
{/* MTTR                                               */}
{/* ================================================== */}

<Grid
    size={{
        xs: 12,
        sm: 6,
        lg: 3
    }}
>

    <Paper
        elevation={4}
        sx={{
            p: 1.5,
            borderRadius: 3,
            height: 425,
            overflow: "hidden"
        }}
    >

        <Typography
            sx={{
                fontSize: 18,
                fontWeight: 700,
                mb: 0.5
            }}
        >
            Mean Time To Resolve (MTTR)
        </Typography>


        <ResponsiveContainer
            width="100%"
            height={360}
        >

            <LineChart
                data={dashboard.resolutionTrend}
                margin={{
                    top: 10,
                    right: 5,
                    left: -15,
                    bottom: 5
                }}
            >

                <CartesianGrid
                    strokeDasharray="3 3"
                />

                <XAxis
                    dataKey="month"
                    tick={{
                        fontSize: 10
                    }}
                />

                <YAxis
                    tick={{
                        fontSize: 10
                    }}
                    tickFormatter={(value) =>
                        `${Math.round(value / 60)}`
                    }
                />

                <Tooltip
                    formatter={(value) => [
                        `${(value / 60).toFixed(1)} min`,
                        "Resolution Time"
                    ]}
                />

                <Line
                    type="monotone"
                    dataKey="resolutionSeconds"
                    stroke="#8B5CF6"
                    strokeWidth={3}
                    dot={{
                        r: 4
                    }}
                    activeDot={{
                        r: 6
                    }}
                />

            </LineChart>

        </ResponsiveContainer>

    </Paper>

</Grid>

</Grid>

</Box>

        </Box>
    );

}