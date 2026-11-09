// Document subjects describe who the content concerns; they never grant access.
// Missing assignment on older records stays unknown. An explicit [] is household-wide.
export function documentPeople(record){
 if(Array.isArray(record?.memberIds))return [...new Set(record.memberIds)];
 return record?.memberId?[record.memberId]:null;
}
export function documentMatchesPerson(record,person){
 return !person||person==='all'||!!documentPeople(record)?.includes(person);
}
