/** Pure hotel-booking functions. Dates are local property calendar dates, YYYY-MM-DD.
 * Checkout is EXCLUSIVE: a stay ending on 2026-11-23 frees the room on Nov 23.
 * No real OTA integration or payment processing is implemented here.
 */
export const CHANNELS = ['Direct', 'Booking.com', 'Airbnb', 'Expedia', 'Walk-in', 'Channex'];
export const STATUSES = ['Confirmed', 'Checked in', 'Checked out', 'Cancelled'];
export const DAY = 86400000;
export const iso = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const parseISO = day => new Date(`${day}T12:00:00`);
export const addDays = (day, number) => { const d = parseISO(day); d.setDate(d.getDate()+number); return iso(d); };
export const nights = (start,end) => {
  const a = Date.parse(`${start}T00:00:00Z`), b = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b-a)/DAY) : NaN;
};
export const isDate = day => /^\d{4}-\d{2}-\d{2}$/.test(day || '') && Number.isFinite(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0,10)===day;
export const intersects = (aStart,aEnd,bStart,bEnd) => aStart < bEnd && bStart < aEnd;
export const liveBookings = bookings => bookings.filter(b => b.status !== 'Cancelled');
export const bookingsForRoom = (bookings,roomId,start,end,excludeId=null) => liveBookings(bookings).filter(b => b.roomId===roomId && b.id!==excludeId && intersects(b.checkIn,b.checkOut,start,end));
export const isAvailable = (bookings, rooms, roomId, start, end, excludeId=null) => {
  const room=rooms.find(r=>r.id===roomId);
  return !!room && room.status!=='Maintenance' && isDate(start)&&isDate(end)&&nights(start,end)>0&&bookingsForRoom(bookings,roomId,start,end,excludeId).length===0;
};
export const amount = (booking, rooms) => (booking.rate ?? rooms.find(r=>r.id===booking.roomId)?.rate ?? 0) * nights(booking.checkIn,booking.checkOut);
export const occupiedOn = (bookings, day) => liveBookings(bookings).filter(b=>b.checkIn<=day && day<b.checkOut);
export const occupancy = (bookings, rooms, day) => {
  const sellable=rooms.filter(r=>r.status!=='Maintenance').length;
  return sellable ? Math.round(100*occupiedOn(bookings,day).length/sellable):0;
};
export const nextBookingId = bookings => `RS-${String(Math.max(1000,...bookings.map(b=>Number(String(b.id).replace(/\D/g,''))||0))+1)}`;
export function validateBooking(candidate,bookings,rooms,excludeId=null){
  if(!candidate.guest || candidate.guest.trim().length<2) return 'Enter the guest’s full name.';
  if(!isDate(candidate.checkIn)||!isDate(candidate.checkOut)||nights(candidate.checkIn,candidate.checkOut)<1) return 'Check-out must be after check-in.';
  if(nights(candidate.checkIn,candidate.checkOut)>365) return 'A stay cannot exceed 365 nights.';
  if(!rooms.some(r=>r.id===candidate.roomId)) return 'Select a valid room.';
  if(!CHANNELS.includes(candidate.channel)) return 'Select a valid booking source.';
  if(!STATUSES.includes(candidate.status)) return 'Select a valid status.';
  if(!Number.isInteger(Number(candidate.guests))||Number(candidate.guests)<1||Number(candidate.guests)>8) return 'Guest count must be between 1 and 8.';
  if(candidate.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email)) return 'Enter a valid email or leave it blank.';
  if(candidate.status!=='Cancelled' && !isAvailable(bookings,rooms,candidate.roomId,candidate.checkIn,candidate.checkOut,excludeId)) return 'This room is unavailable for those dates. Choose another room or stay.';
  return null;
}
export function createSeed(today=iso(new Date())) {
 const rooms=[
  {id:'101',name:'Classic King',type:'Classic',floor:'1st floor',rate:15200,status:'Ready'},
  {id:'102',name:'Classic Twin',type:'Classic',floor:'1st floor',rate:14200,status:'Ready'},
  {id:'201',name:'Garden Deluxe',type:'Deluxe',floor:'2nd floor',rate:21500,status:'Ready'},
  {id:'202',name:'Terrace Deluxe',type:'Deluxe',floor:'2nd floor',rate:23800,status:'Ready'},
  {id:'301',name:'Signature Suite',type:'Suite',floor:'3rd floor',rate:38000,status:'Ready'},
  {id:'302',name:'Panorama Suite',type:'Suite',floor:'3rd floor',rate:42500,status:'Ready'},
  {id:'103',name:'Courtyard Queen',type:'Classic',floor:'1st floor',rate:15900,status:'Ready'},
  {id:'203',name:'Garden Studio',type:'Deluxe',floor:'2nd floor',rate:19900,status:'Maintenance'}
 ];
 const raw=[
  ['RS-1001','Nadia Bensaïd','101',-2,2,'Booking.com','Checked in','nadia@example.com',2],
  ['RS-1002','Yacine Belkacem','201',-1,3,'Direct','Checked in','yacine@example.com',2],
  ['RS-1003','Sofia Laurent','301',0,4,'Expedia','Confirmed','sofia@example.com',2],
  ['RS-1004','Karim Haddad','102',1,5,'Booking.com','Confirmed','karim@example.com',1],
  ['RS-1005','Meriem Bouzid','202',2,6,'Direct','Confirmed','meriem@example.com',2],
  ['RS-1006','Adam Moreau','302',3,7,'Airbnb','Confirmed','adam@example.com',2],
  ['RS-1007','Inès Ouali','103',-4,-1,'Walk-in','Checked out','ines@example.com',1],
  ['RS-1008','Rania Djouadi','101',4,6,'Direct','Confirmed','rania@example.com',2],
  ['RS-1009','Pierre Dubois','201',5,8,'Booking.com','Confirmed','pierre@example.com',2],
  ['RS-1010','Lina Amrani','103',0,2,'Direct','Confirmed','lina@example.com',1],
  ['RS-1011','Nassim Cherif','102',-4,-1,'Expedia','Checked out','nassim@example.com',2],
  ['RS-1012','Sara Benali','202',-6,-3,'Airbnb','Checked out','sara@example.com',2],
  ['RS-1013','Amel Rahmani','302',-10,-8,'Direct','Checked out','amel@example.com',2]
 ];
 const bookings=raw.map(([id,guest,roomId,a,b,channel,status,email,guests])=>({id,guest,roomId,checkIn:addDays(today,a),checkOut:addDays(today,b),channel,status,email,guests,rate:rooms.find(r=>r.id===roomId).rate,createdAt:today}));
 return {version:1,hotelName:'Maison Oran',location:'Oran, Algeria',rooms,bookings,createdAt:today};
}
export function validateImport(input) {
 if(!input || input.version!==1 || !Array.isArray(input.rooms) || !Array.isArray(input.bookings)||typeof input.hotelName!=='string') throw new Error('This is not a supported HOMA backup.');
 if(input.rooms.length>3000||input.bookings.length>50000) throw new Error('Backup is too large.');
 const ids=new Set();
 for(const r of input.rooms){ if(!r.id||ids.has(r.id)||!Number.isFinite(r.rate)||r.rate<0) throw new Error('Invalid room data in backup.'); ids.add(r.id); }
 // Imported backups are untrusted; collisions would mislead availability and occupancy.
 const seenBookings = new Set();
 for (const b of input.bookings) {
  if (!b || typeof b.id !== 'string' || seenBookings.has(b.id) || !b.id.trim()) throw new Error('Duplicate or missing reservation ID in backup.');
  seenBookings.add(b.id);
  if (!isDate(b.checkIn) || !isDate(b.checkOut) || nights(b.checkIn,b.checkOut)<1 || !ids.has(b.roomId) || !STATUSES.includes(b.status)) throw new Error('Invalid reservation in backup.');
  if (typeof b.guest !== 'string' || b.guest.trim().length<2 || !CHANNELS.includes(b.channel) || !Number.isFinite(Number(b.rate)) || Number(b.rate)<0) throw new Error('Invalid guest, channel or reservation rate in backup.');
 }
 const occupied = input.bookings.filter(b => b.status !== 'Cancelled').sort((a,b)=>a.roomId.localeCompare(b.roomId)||a.checkIn.localeCompare(b.checkIn));
 for (let i=1;i<occupied.length;i++) {
  const prev=occupied[i-1], current=occupied[i];
  if (prev.roomId===current.roomId && intersects(prev.checkIn,prev.checkOut,current.checkIn,current.checkOut)) throw new Error('Overlapping reservations in backup.');
 }
 return input;
}
