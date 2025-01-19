# TODO List

| **Priority** | **Task**                              | **Description**                                                                 | **Status**      |
|--------------|---------------------------------------|---------------------------------------------------------------------------------|-----------------|
| 🟥 High      | Refactor Swap Logic                  | Break down `decodeSwapInstruction` into smaller, reusable functions.           | [ ] Pending     |
| 🟥 High      | Error Handling                       | Add error checks for transaction and balance data with detailed error messages. | [ ] Pending     |
| 🟥 High      | Unit Tests                           | Write tests for `compareBalances` and token transfers (`IN`/`OUT`).             | [ ] Pending     |
| 🟧 Medium    | Documentation                        | Add comments to helper functions and update `README.md` with examples.          | [ ] Pending     |
| 🟧 Medium    | Optimize Token Details Fetch         | Cache token details and add rate-limiting/batching if required.                 | [ ] Pending     |
| 🟨 Low       | Performance Improvements             | Profile transaction parsing for large datasets and optimize bottlenecks.        | [ ] Pending     |
| 🟨 Low       | Code Cleanup                        | Remove unused variables and enforce consistent formatting with a linter.        | [ ] Pending     |
| ✅ Done      | Project Initialization               | Set up project structure and configure TypeScript, linting, and formatting.     | [x] Done        |
| ✅ Done      | Basic Swap Decoding                  | Implement initial logic to decode swap instructions and verify functionality.   | [x] Done        |
| 🟦 In Progress | Add Type Safety                     | Implement strict type safety for all transaction parsing methods.               | [ ] In Progress |

---

## Instructions for Use
1. **Update Status:**
   - `[ ] Pending` for tasks not yet started.
   - `[x] Done` for completed tasks.
   - `[ ] In Progress` for tasks actively being worked on.
2. **Add Tasks:** Insert a new row in the table under the appropriate priority.

--- 
