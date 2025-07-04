<investment>
{{description}}
</investment>

{{#launchpadInfo}}
<launchpad_info>
{{launchpadInfo}}
</launchpad_info>
{{/launchpadInfo}}

<rules>
# Rules for analysis
Do not jump to conclusions when you don't know if the tokens have been sold or locked. Simply remind the user to check. But if a sell-off (rug pull) has been detected, it should make this uninvestable and be rated 0. If the creator acquired more tokens, that should indicate confidence in his project. If the creator's allocation is less than 10% of the total supply, it's a problem because he holds too few tokens, might not be committed to the project, and is sufficiently incentivized. On the other side of the spectrum, having more than 50% would be considered too much and negatively affect the GINI of token distribution (unless he plans to transparently give tokens away shortly). If the creator's tokens have been burned, do not discuss this event as it's most likely a sign of project graduation and you can't draw conclusions from it.
Use proper punctuation, casing, and grammar.
Examples of questions that could factor into the analysis:
- Is the token truly needed, or does it only create additional friction? Maybe using a stablecoin, ETH, or even card payments would have been better.
- Does it benefit centralization and "crypto wheels", or would it have been better as a traditional company?
- Are there details about the team or the legal entity behind the project?
- If it's a memecoin, is it actually funny?
- Do the tokenomics make sense?
- Is there a problem being solved? Does it add value? Would anyone pay for the solution?
- Are the security risks acceptable?

{{#launchpadInfo}}
# Launchpad-specific considerations
Consider the launchpad information provided in the "launchpad_info" section when evaluating this launch:
- Factor in the specific launchpad mechanisms and processes into your analysis
- Be aware of the typical token distribution patterns for this specific launchpad
- Do not mention the liquidity lock as a positive since most launchpads have this mechanism for graduating projects
- For genesis launches on Virtuals Protocol, the tokenomics will be available in the full_details section, under the "tokenomics" key. The web app calculates developer allocation based on all fields containing these strings: "core", "team", "develop", "advisor", "adviser", "investor", "founder", "operations", "treasury", "partner", "builder", "production", "vault"; as this is not an accurate method, trying to understand the information from the tokenomics key is better.
- For genesis launches on Virtuals Protocol, it's not a red flag if these fields are missing, since the token will only be created if enough investors subscribe to the launch: "Token address", "Liquidity contract", "Top holders"
{{/launchpadInfo}}

# Rules for summary
- do not sentence case (but do upper case properly otherwise, like "AI" instead of "ai"), and do not use punctuation at the end unless it's for a joke
- it should be one sentence with a TLDR ELI5 of what the coin is about (preferably less than 15 words); for example: "a multi-agentic ecosystem focused on bringing passive income to its stakers"
- if it's a memecoin with no utility, you can simply output "memecoin"
- if it seems to be a scam, you can simply output "scam"
- if it's just trying to create the illusion of technological sophistication, you can output "technobabble"
- if the creator sold more than 20% of the tokens, you should output "rug pull"
- do not mention that a coin is speculative; since all investments are speculative, that wouldn't add value to the summary
- the summary must focus on describing what the investment is about unless a one or two-word summary would save users' time; be more likely to do super-short summaries if it's a low-rated investment

# Rules for rating
- the rating is based mainly on the analysis
- if there's little information available about the launch, rate it lower
- if there's not enough information for a proper rating, return 0
- if it's a memecoin, be much more likely to rate it lower, and never higher than 2
- if the creator's allocation is less than 10% or more than 50% of the total supply, you should rate it much lower unless the tokenomics explains why it's reasonable
- if the creator's allocation is less than 5% and this pretends to be a serious investment instead of a memecoin, return 0
- if the creator's allocation is more than 80% of the total supply, return 0
- the token supply is irrelevant, since it's the actual fully-diluted market cap that matters to investors
</rules>

Analyze if the project from the "investment" section is good, then rate it as an investment opportunity from 0 to 10 and summarize it. Return your response as a JSON object with keys "analysis", "rating" (an integer), and "summary". For each of the three responses, respect the corresponding set of directives mentioned in the "rules" section (analysis, summary, and rating, respectively).
