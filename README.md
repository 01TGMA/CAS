# Smart Attendance Management and Examination Eligibility System

A web-based application that digitizes classroom attendance using QR codes, automatically calculates attendance marks and percentages, and determines examination eligibility based on configurable institutional thresholds.

## Overview

Traditional paper-based attendance is time-consuming, hard to maintain, and vulnerable to proxy attendance (a student signing in for someone who isn't present). This system replaces manual sign-in sheets with a QR-code-based workflow, backed by student authentication and anti-fraud controls, so attendance records are faster to collect and harder to manipulate.

## Problem Statement

- Manual attendance consumes lecture time.
- Paper-based methods are easy to manipulate via proxy attendance.
- Calculating attendance percentages by hand is error-prone, especially across multiple courses.
- Students often don't know their attendance status until eligibility is decided at the end of the semester.

## Aim

Develop a web-based attendance management system that records attendance reliably, calculates attendance performance automatically, and determines examination eligibility in real time.

## Objectives

- Provide a user-friendly web app for managing attendance.
- Let lecturers create attendance sessions and generate QR codes.
- Authenticate students before recording attendance.
- Prevent proxy and duplicate attendance.
- Automatically assign attendance marks per session.
- Track attendance records per student/course throughout the semester.
- Calculate attendance percentage and display eligibility status in real time.
- Reduce administrative overhead for lecturers.

## User Roles

### Lecturer
- Create and manage courses
- Create attendance sessions and set marks per session
- Generate and display QR codes
- Monitor attendance and view accumulated marks
- Configure minimum attendance percentage for eligibility

### Student
- Log in and view registered courses
- Scan attendance QR codes
- View attendance history, marks, and percentage
- Check real-time examination eligibility status

## How It Works

1. **Session Creation** – Lecturer selects a course and creates an attendance session with an assigned mark (e.g., 2 marks).
2. **QR Code Generation** – System generates a session-specific QR code, projected in the classroom.
3. **Scan** – Students scan the QR code with their device.
4. **Authentication** – Student identity is verified and course enrollment is checked.
5. **Validation** – System checks for duplicates and applies anti-abuse controls (session ID, timestamps, IP as a secondary signal).
6. **Recording** – Valid attendance is recorded and marks are assigned.
7. **Semester Calculation** – Attendance percentage, total marks, and eligibility are recalculated automatically.
8. **Eligibility Check** – Percentage is compared against the configured threshold (e.g., 75%) to show *Eligible* or *Not Currently Eligible*.

```
Lecturer → Creates Session → QR Code Generated → QR Displayed → Student Scans →
Student Authenticated → Attendance Validated → Attendance Recorded →
Marks Updated → Percentage Calculated → Eligibility Determined
```

## Core Features

- **QR Code Attendance** – Session-specific, ideally short-lived/expiring codes.
- **Student Authentication** – Required before any attendance is accepted.
- **Duplicate Prevention** – One attendance record per student per session.
- **Attendance Marks** – Configurable per session, auto-added to student records.
- **Attendance Percentage** – `(Classes Attended ÷ Total Classes Held) × 100`
- **Examination Eligibility** – Auto-compared against a configurable threshold.
- **Lecturer Dashboard** – Manage courses, sessions, students, and records.
- **Student Dashboard** – View courses, history, marks, percentage, and eligibility.

## System Architecture

**Presentation Layer** — Student/lecturer interfaces, login, QR scanner, dashboards (HTML/CSS/JS).

**Application Layer** — Authentication, QR/session validation, mark and eligibility calculation, access control, duplicate prevention (backend framework of choice: Python, Node.js, PHP, Java, etc.).

**Database Layer** — Student/lecturer accounts, courses, registrations, sessions, attendance records, marks, and eligibility rules (relational DB such as MySQL or PostgreSQL).

## Security & Anti-Fraud Considerations

IP-based restriction alone is insufficient — many students can share one IP (e.g., campus Wi-Fi) while it's also bypassable. The system instead layers multiple controls:

1. Student authentication
2. Course enrollment verification
3. Short-lived QR codes
4. Unique session identifiers
5. One record per student per session
6. Server-side timestamp validation
7. IP logging as a secondary signal only
8. Suspicious activity detection
9. Lecturer access controls
10. Secure credential storage

**Note:** The goal is to make fraudulent attendance significantly harder, not to guarantee it is impossible.

## User Flows

**Student:** Login → Select/Enter Attendance → Scan QR → Confirm → Attendance Recorded

**Lecturer:** Login → Select Course → Create Session → Set Mark → Display QR → Monitor Attendance

## Benefits

| Stakeholder | Benefits |
|---|---|
| Students | Faster check-in, transparent records, early eligibility awareness |
| Lecturers | Less time on attendance, automatic calculations, easier monitoring |
| Institution | Centralized records, reduced proxy attendance, easier policy enforcement |

## Limitations

- Does not fully eliminate fraud (e.g., digitally shared QR codes).
- IP addresses cannot reliably identify individuals.
- Depends on reliable internet/network access.
- Eligibility rules vary by department/institution, so thresholds must remain configurable rather than hard-coded.

## Future Improvements

- Push/email notifications for low attendance
- Attendance analytics and downloadable reports
- Integration with existing student information systems
- Role-based administration and audit logs
- Auto-expiring QR codes
- Geolocation-based verification (where legally permitted)
- Device/session verification
- Automated suspicious-pattern alerts

## Expected Outcome

A functional web application where lecturers create sessions and generate QR codes, students authenticate and check in, and the system maintains attendance records while automatically calculating marks, percentages, and examination eligibility.

## Conclusion

This project replaces manual, error-prone attendance tracking with a centralized digital platform that connects attendance directly to examination eligibility — giving students transparency and reducing administrative burden for lecturers, while applying core software engineering principles: web development, database design, authentication, and security.
