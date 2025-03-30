# Scanner

Live on: https://scanner.trulyadog.com

## TODO (short term)

- [x] Set up the repo
- [x] Deploy on Vercel
- [x] Add a database and attach it to the UI
- [x] Show launches on homepage (mock data for now)
- [x] Add a first filter on the navbar
- [x] Add a launch page, where the launch details are shown
- [x] Research what launchpads to support initially
- [x] Summarize, analyze, and rate launches with a LLM
- [x] Add a crypto launchpad, where the launches are events detected on an EVM contract - added "VIRTUALS Protocol (Base)"
- [x] Check if dev tokens have been sold or locked
- [x] Modify db schema to also store for each launch if the creator still holds tokens
- [x] Separate databases for production and development
- [x] Add .md files for each launchpad with relevant information; they should be used in LLM calls
- [ ] Add another crypto launchpad, but for Solana (SVM)
- [ ] Add a traditional VC investing launchpad, where the listener of the class extracts information by crawling the launchpad website
- [ ] Add Launchpad base class
- [ ] Add a password-protected Admin page that allows adding launches using Launchpad base class, or edit/remove existing ones

Hopefully, the latter three items (classes) will serve as templates for others to contribute to Scanner and add other launchpads.

## TODO (long term)

- [ ] Add functionality in the Admin page to trigger token movement check or LLM analysis with various filters (by date, by launchpad, etc.)
- [ ] Access relevant links when analyzing a launch (anything mentioned in the launch page: socials, website, documentation, etc.)
- [ ] Add for users the possibility to add a custom link to a launch, which will then be analyzed and potentially added in the database
- [ ] Add a comment section for each launch; a random username will be generated based on the user's IP address (the algorithm should always generate the same username for the same IP address)
- [ ] Add like/dislike buttons for each launch
- [ ] Add unit and integration tests

