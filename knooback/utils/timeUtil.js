// Convierte "hh:mm AM/PM" -> "HH:MM:SS" (24h)
function convertTo24Hour(time12h) {
  const [time, modifier] = time12h.split(' ');
  let [hours, minutes] = time.split(':');

  if (hours === '12') {
    hours = '00';
  }

  if (modifier === 'PM') {
    hours = parseInt(hours, 10) + 12;
  }

  return `${hours}:${minutes}:00`;
}

// Convierte "HH:MM:SS" (24h) -> "hh:mm AM/PM"
function convertTo12Hour(time24h) {
  const [hours, minutes] = time24h.split(':');
  const hour12 = hours % 12 || 12;
  const ampm = hours < 12 ? 'AM' : 'PM';
  return `${hour12}:${minutes} ${ampm}`;
}

module.exports = { convertTo24Hour, convertTo12Hour };
