const { HttpError, dateOnly } = require('./validation');
function civilParts(instant, timeZone) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
    }).formatToParts(instant).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
function scheduledInstant(date, time, timeZone) {
    dateOnly(date);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) throw new HttpError(400,'Horário inválido.');
    const desired = Date.parse(date+'T'+time+':00Z');
    let instant = desired;
    for (let i=0;i<3;i++) {
        const p=civilParts(new Date(instant),timeZone);
        const represented=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
        instant += desired-represented;
    }
    const p=civilParts(new Date(instant),timeZone);
    if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` !== date+'T'+time) throw new HttpError(400,'Horário inexistente no fuso configurado.');
    return new Date(instant);
}
module.exports={civilParts,scheduledInstant};
