<investment>
{{description}}
</investment>

<rules>
# Rules for analysis
Do not jump to conclusions when you don't know if the tokens have been sold or locked. Simply remind the user to check.
Use proper punctuation, casing and grammar.
Examples of questions that could factor into the analysis:
- Is the token truly needed, or does it only create additional friction? Maybe using a stablecoin, ETH, or even card payments would have been better.
- Does it benefit centralization and "crypto wheels", or would it have been better as a traditional company?
- Are there details about the team or the legal entity behind the project?
- If it's a meme coin, is it actually funny?
- Do the tokenomics make sense?
- Is there a problem being solved? Does it add value? Would anyone pay for the solution?
- Are the security risks acceptable?

# Rules for summary
- do not uppercase the first letter of the sentence (but do uppercase properly otherwise), and do not use punctuation at the end unless it's for a joke
- it should be one sentence with a TLDR ELI5 of what the coin is about (preferably less than 15 words); for example: "a multi-agentic ecosystem focused on bringing passive income to its stakers"
- if it's a meme coin with no utility, you can simply output "memecoin"
- if it seems to be a scam, you can simply output "scam"
- if it's just trying to create the illusion of technological sophistication, you can output "technobabble"
- do not mention that a coin is speculative; since all investments are speculative, that wouldn't add value to the summary

# Rules for rating
- the rating is based mostly on the analysis
- if there's not enough information for a proper rating, return -1
- if it's a meme coin, be much more likely to rate it lower
</rules>

Analyze if the above is a good crypto investment, then rate it as an investment from 0 to 10 and summarize it. Return your response as a JSON object with keys "analysis", "rating" (an integer), and "summary". Respect the rules for analysis, summary, and rating.
