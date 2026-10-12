# Firestore Schema Documentation

## Collections

### `users/{uid}`
User profile and settings.

| Field | Type | Description |
|-------|------|-------------|
| uid | string | Firebase Auth UID |
| email | string | Email address |
| displayName | string | Display name |
| photoURL | string? | Profile photo URL |
| semester | string? | e.g. "5th" |
| section | string? | e.g. "A" |
| college | string? | Institution name |
| attendanceTarget | number | 50–100, default 75 |
| emailVerified | boolean | Auth email verified |
| fcmTokens | string[] | FCM device tokens |
| createdAt | Timestamp | Account creation |
| updatedAt | Timestamp | Last update |

### `users/{uid}/subjects/{subjectId}`
Enrolled subjects.

| Field | Type | Description |
|-------|------|-------------|
| uid | string | Owner UID |
| name | string | Subject full name |
| code | string | Subject code |
| faculty | string? | Faculty name |
| credits | number | Credit hours |
| color | string | Hex color for UI |
| createdAt | Timestamp | |
| updatedAt | Timestamp | |

### `users/{uid}/timetable/{slotId}`
Weekly recurring class slots.

| Field | Type | Description |
|-------|------|-------------|
| uid | string | Owner UID |
| subjectId | string | Ref to subjects |
| subjectName | string | Denormalized |
| subjectCode | string | Denormalized |
| faculty | string? | Faculty for this slot |
| room | string? | Room number |
| dayOfWeek | number | 0=Sun, 1=Mon...6=Sat |
| startTime | string | HH:mm |
| endTime | string | HH:mm |
| color | string | Hex color |
| isActive | boolean | Soft-delete flag |
| createdAt | Timestamp | |
| updatedAt | Timestamp | |

### `users/{uid}/attendance/{recordId}`
Individual attendance events.

| Field | Type | Description |
|-------|------|-------------|
| uid | string | Owner UID |
| subjectId | string | Subject reference |
| date | Timestamp | Date of class (UTC midnight) |
| lectureSlotId | string? | Timetable slot reference |
| status | string | present/absent/not_marked/cancelled |
| source | string | manual/email_import/baseline |
| notes | string? | Optional correction note |
| createdAt | Timestamp | |
| updatedAt | Timestamp | |

**Uniqueness constraint**: No two records with same subjectId + date + status should exist (enforced in app logic).

### `users/{uid}/attendanceBaselines/{baselineId}`
Imported historical totals (e.g., from a portal export). Prevents double-counting.

| Field | Type | Description |
|-------|------|-------------|
| uid | string | Owner UID |
| subjectId | string | |
| attended | number | Historical attended |
| conducted | number | Historical conducted |
| asOfDate | Timestamp | Cutoff date |
| createdAt | Timestamp | |

**Note**: Attendance calculations add baseline totals to live attendance records.

### `users/{uid}/notifications/{notifId}`
In-app and push notifications.

| Field | Type | Description |
|-------|------|-------------|
| uid | string | Owner UID |
| type | string | class_reminder/attendance_alert/timetable_revision/sync_failure |
| title | string | Notification title |
| body | string | Notification body |
| read | boolean | Read status |
| createdAt | Timestamp | |

### `users/{uid}/emailConnections/{connId}`
Email provider OAuth connections. **Tokens stored server-side only.**

| Field | Type | Client-readable | Description |
|-------|------|-----------------|-------------|
| uid | string | yes | |
| email | string | yes | Connected email |
| provider | string | yes | gmail/microsoft |
| status | string | yes | connected/disconnected/error |
| lastSyncAt | Timestamp | yes | |
| lastSyncStatus | string | yes | success/failure |
| lastSyncError | string | yes | Error message |
| _refreshToken | string | **NO** | Stored server-side only |
| _tokenExpiry | number | **NO** | |
| createdAt | Timestamp | yes | |
| updatedAt | Timestamp | yes | |

### `timetableImportJobs/{jobId}`
Import jobs created by client, processed by backend.

### `timetableRevisions/{revId}`
Detected timetable changes awaiting user review. Backend-managed.

### `auditLogs/{logId}`
Server-side only. Records auth events, OAuth events, sync events.

## Security Design
- All `_*` fields (tokens) have no client read access via security rules
- `auditLogs` is completely blocked for clients
- `attendanceBaselines` and `notifications` are write-protected (backend only)
- Email domain validation is enforced by Cloud Function, not client code
