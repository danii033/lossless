Project Status

This project is a working prototype.
Core features such as track detection, popup interaction, data sharing, and feed rendering are implemented.
Authentication and full multi user support are partially implemented and limited to the developer environment due to security constraints.



Key Features Implemented

Chrome extension popup interface
Detection of currently playing tracks from browser tabs
Support for YouTube and Spotify track extraction
Share track metadata to Firebase Firestore
Feed page that displays shared tracks in chronological order
Ability for users to delete their own posts
Reset login state from the popup



Technologies Used

JavaScript
HTML and CSS
Chrome Extension APIs
Firebase Authentication
Firebase Firestore
Google OAuth



How to Run the Extension

Clone the repository
Open Google Chrome
Navigate to chrome extensions
Enable Developer Mode
Click Load unpacked
Select the project folder
The Lossless extension will appear in the Chrome toolbar
The popup can then be opened by clicking the extension icon.



**Important Limitations of This Prototype**

Authentication Limitation
Google login is implemented using Firebase Authentication.
However, Firebase restricts authentication to approved domains and extension IDs for security reasons.
Because of this:
Only the developer environment is authorised to complete Google login successfully.
When another user runs the project locally, Firebase blocks authentication because their domain and extension ID are not whitelisted.
As a result, login will not complete for other users without additional Firebase configuration.




Feed Limitation

The feed depends on an authenticated user to load and filter posts.
Since login cannot complete outside the developer environment:
The feed will not display posts correctly for other users.
This is a known and expected limitation at prototype stage.




This prototype is intended to demonstrate:

System architecture
Use of browser APIs
Integration with Firebase services
Client side state management
Core application logic

Planned Future Improvements
Firebase authentication configuration for public deployment
Secure backend functions for user validation
Friend system and filtered feeds
Improved Apple Music track detection
Production hosting for login and feed pages
UI and UX refinements



Notes for Assessors

This repository represents a functional prototype.
Some features are intentionally restricted due to authentication security constraints and are documented clearly above.
All core logic, architecture, and integration work is implemented and can be reviewed directly in the source code.
