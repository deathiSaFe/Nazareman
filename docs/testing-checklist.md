# Nazareman MVP Testing Checklist

## Setup
1. Ensure PostgreSQL is running
2. Verify `.env` has `DATABASE_URL` (and `ADMIN_PHONE` to bootstrap the first admin)
3. Run: `npx prisma migrate deploy`
4. Run: `npm run db:seed`
5. Run: `npm run dev`
6. Open `http://localhost:3000`

---

## 1. Homepage
- [ ] Page loads without errors
- [ ] RTL layout is correct
- [ ] Fonts display Persian text properly

---

## 2. Topics List (`/topics`)
- [ ] Page loads with topic cards
- [ ] Loading skeleton appears briefly
- [ ] Empty state shows if no approved topics exist
- [ ] Error state shows if API fails
- [ ] Each card shows: name, type, city, description
- [ ] Cards link to topic detail page
- [ ] Mobile: cards stack vertically
- [ ] Mobile: text is readable

---

## 3. Topic Detail (`/topic/[id]`)
- [ ] Approved topic loads correctly
- [ ] Topic name, type, city, description display
- [ ] Image displays if available
- [ ] Image placeholder shows if no image
- [ ] Comments list displays approved comments
- [ ] Empty comments state shows message
- [ ] Loading skeleton appears
- [ ] Invalid topic ID shows 404
- [ ] Back link to `/topics` works

---

## 4. Add Topic Flow (`/add-topic`)
- [ ] Step 1: Topic type grid displays
- [ ] Selecting a type reveals Step 2
- [ ] Step 2: Search input appears
- [ ] Entering name and pressing Enter shows continue button
- [ ] Continue button reveals Step 3
- [ ] Step 3: Form shows name, city, description
- [ ] Submit with empty name shows error
- [ ] Submit with description < 20 chars shows Persian error
- [ ] Successful submit redirects to topic page
- [ ] Pending banner shows on new topic page
- [ ] Comment form is visible and scrollable

---

## 5. Comment Flow
- [ ] Comment form appears on topic page
- [ ] Empty comment shows validation error
- [ ] Comment < 5 chars shows validation error
- [ ] Valid comment submits successfully
- [ ] Success message appears
- [ ] Comment appears in list after refresh (if topic is pending)
- [ ] Comment shows "در انتظار بررسی" badge when pending
- [ ] Duplicate submission is prevented

---

## 6. Admin Login (`/admin`)
- [ ] Signing in with a non-admin account shows the admin login prompt
- [ ] Signing in with a UserRole.ADMIN account grants access
- [ ] Admin navigation links work

---

## 7. Admin Topics (`/admin/topics`)
- [ ] Pending topics list displays
- [ ] Each topic shows: name, type, city, date, description
- [ ] Approve button works
- [ ] Reject button works
- [ ] Topic disappears from list after action
- [ ] Empty state shows when no pending topics
- [ ] Loading skeleton appears

---

## 8. Admin Comments (`/admin/comments`)
- [ ] Pending comments list displays
- [ ] Each comment shows: text, topic name, date
- [ ] Approve button works
- [ ] Reject button works
- [ ] Comment disappears from list after action
- [ ] Empty state shows when no pending comments
- [ ] Loading skeleton appears

---

## 9. Error States
- [ ] API 500 errors show Persian message
- [ ] Network errors show Persian message
- [ ] 404 pages render correctly
- [ ] Form validation errors are clear

---

## 10. Mobile Responsiveness
- [ ] `/topics` grid stacks on mobile
- [ ] `/topic/[id]` content is readable
- [ ] `/add-topic` form is usable
- [ ] `/admin` tables/cards are readable
- [ ] Buttons are tappable (min 44px)
- [ ] Text inputs are usable
- [ ] No horizontal scrolling

---

## 11. RTL & Persian
- [ ] All text is right-aligned
- [ ] Persian numerals display correctly
- [ ] Dates format in Persian
- [ ] No LTR text leakage
- [ ] Icons point correct direction