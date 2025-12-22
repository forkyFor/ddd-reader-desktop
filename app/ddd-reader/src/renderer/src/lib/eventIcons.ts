import drivePng from "../assets/event-icons/drive.png";
import workPng from "../assets/event-icons/work.png";
import restPng from "../assets/event-icons/rest.png";
import unknownPng from "../assets/event-icons/unknown.png";

import eventPng from "../assets/event-icons/event.png";
import faultPng from "../assets/event-icons/fault.png";
import violationPng from "../assets/event-icons/violation.png";
import anomalyPng from "../assets/event-icons/anomaly.png";
import calibrationPng from "../assets/event-icons/calibration.png";
import vehiclePng from "../assets/event-icons/vehicle.png";
import cardPng from "../assets/event-icons/card.png";
import speedPng from "../assets/event-icons/speed.png";
import powerPng from "../assets/event-icons/power.png";
import tamperPng from "../assets/event-icons/tamper.png";
import timePng from "../assets/event-icons/time.png";
import warningPng from "../assets/event-icons/warning.png";
import infoPng from "../assets/event-icons/info.png";
import okPng from "../assets/event-icons/ok.png";

export function getEventIconUrl(key: string): string | null {
    const k = String(key ?? "").toLowerCase();
    if (k === "drive") return drivePng;
    if (k === "work") return workPng;
    if (k === "rest") return restPng;
    if (k === "unknown") return unknownPng;
    if (k === "event") return eventPng;
    if (k === "fault") return faultPng;
    if (k === "violation") return violationPng;
    if (k === "anomaly") return anomalyPng;
    if (k === "calibration") return calibrationPng;
    if (k === "vehicle") return vehiclePng;
    if (k === "card") return cardPng;
    if (k === "speed") return speedPng;
    if (k === "power") return powerPng;
    if (k === "tamper") return tamperPng;
    if (k === "time") return timePng;
    if (k === "warning") return warningPng;
    if (k === "info") return infoPng;
    if (k === "ok") return okPng;
    return null;
}
