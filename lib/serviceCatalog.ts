// Shared display and server price list. Calendar reservations remain 45 minutes.
export const services = [
  { id: 'mens_scissor_cut', name: "Men's - Scissor cut", price: 22, durationMins: 45 },
  { id: 'mens_clipper_cut', name: "Men's - Clipper cut / Fade", price: 20, durationMins: 40 },
  { id: 'student_scissor_cut', name: 'Student - Scissor cut', price: 18, durationMins: 45 },
  { id: 'student_clipper_cut', name: 'Student - Clipper cut / Fade', price: 16, durationMins: 40 },
  { id: 'boys_cut', name: 'Boys cut (<14)', price: 14, durationMins: 30 },
];
export function findService(name: unknown) {
  return typeof name === 'string' ? services.find(service => service.name === name) : undefined;
}
