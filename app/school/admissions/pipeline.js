// The admissions pipeline, as data.
//
// A plain module, not the actions file: everything exported from a
// 'use server' module has to be an async function, so a label map living
// there is a build error waiting to happen.
//
//     applied -> review -> accepted -> enrolled
//                      \-> rejected
//
// Enrolment is deliberately not a move in this table. An applicant becomes a
// pupil by having a student record written, and a status that could be set
// without one would let the school record an admission that admitted nobody.
// The database agrees: admission_inquiries carries a check constraint saying
// enrolled and student_id are true together or not at all.

export const STATUS_LABEL = {
  applied: 'Applied',
  review: 'In review',
  accepted: 'Accepted',
  rejected: 'Rejected',
  enrolled: 'Enrolled',
}

// Where a record may go from where it is. Checked on the server, because a
// posted status is a string from the internet.
export const NEXT = {
  applied: ['review', 'accepted', 'rejected'],
  review: ['accepted', 'rejected', 'applied'],
  accepted: ['rejected', 'review'],
  rejected: ['applied', 'review'],
  enrolled: [],
}
