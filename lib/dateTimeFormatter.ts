export const displayValidTill = (validDate: string, validTime?: string) => {
  let isoString = "";

  if (validDate.includes("T")) {
    isoString = validDate;
    isoString = isoString.replace(/\+00:00$/, "Z");
    if (!isoString.endsWith("Z") && isoString.includes(".")) {
      isoString = isoString + "Z";
    }
  } else {
    const sanitizedTime = validTime?.replace("+00", "Z") || "00:00:00Z";
    isoString = `${validDate}T${sanitizedTime}`;
  }
  
  let date = new Date(isoString);
  
  if (isNaN(date.getTime())) {
    date = convertToValidTillISO(validDate, validTime ?? "");
  }

  const formattedDate = date.toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const dayName = date.toLocaleDateString("en-CA", { weekday: "long" });
  
  const formattedTime = date.toLocaleTimeString("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return `${formattedDate} ${dayName} ${formattedTime}`;
};

    function convertToValidTillISO(valid_date: string, valid_time: string) {
      const [time, modifier] = valid_time.split(" ");
      let [hours, minutes] = time.split(":").map(Number);

      if (modifier === "PM" && hours < 12) hours += 12;
      if (modifier === "AM" && hours === 12) hours = 0;

      const hourStr = hours.toString().padStart(2, "0");
      const minuteStr = minutes.toString().padStart(2, "0");

      const time24hr = `${hourStr}:${minuteStr}:00`;

      const isoString = `${valid_date}T${time24hr}-04:00`;
      return new Date(isoString);
    }


    export function convert12HourTo24Hour(formattedTime: string) {
      // Regular expression to match "HH:MM AM/PM" format
      const timeRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
      const match = formattedTime.match(timeRegex);

      if (!match) {
        console.log("Invalid time format. Expected 'HH:MM AM/PM'.");
        return null; // Return null for invalid input
      }

      let [_, hour12Str, minuteStr, ampm] = match;

      let hour = parseInt(hour12Str, 10);
      const minutes = parseInt(minuteStr, 10);
      ampm = ampm.toUpperCase(); // Ensure AM/PM is uppercase for consistent comparison

      // Validate hour and minute ranges
      if (hour < 1 || hour > 12 || minutes < 0 || minutes > 59) {
        console.log("Invalid hour or minute value.");
        return null;
      }

      // Convert to 24-hour format
      if (ampm === "PM" && hour !== 12) {
        hour += 12;
      } else if (ampm === "AM" && hour === 12) {
        hour = 0; // 12 AM is 00 in 24-hour format
      }

      // Pad with leading zeros if necessary
      const hour24Str = hour.toString().padStart(2, "0");
      const minute24Str = minutes.toString().padStart(2, "0");

      return `${hour24Str}:${minute24Str}`;
    }