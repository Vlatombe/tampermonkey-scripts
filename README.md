# tampermonkey-scripts

# Jira links in GitHub

This detects patterns in commits, pull requests that look like jira ids and convert them to links.

* [Install](https://github.com/Vlatombe/tampermonkey-scripts/raw/main/jiralinks.user.js)

# CloudBees Unify: Run Gantt

This adds a "Gantt" button to CloudBees Unify run pages (components, applications and releases).
The button sits next to the jobs panel toggle on the Jobs tab, and floats in the bottom-right corner on other tabs.
A replay button plays the run back from its first job, at an adjustable speed.
It opens a live Gantt chart of all the jobs of the run, showing which jobs are blocked on dependencies and which are queued for a runner.
It reuses the Unify UI's own session to call the API, so no personal access token is needed.

* [Install](https://github.com/Vlatombe/tampermonkey-scripts/raw/main/unify-run-gantt.user.js)

# CloudBees Unify: Run previous/next

This adds previous/next run buttons next to the title of CloudBees Unify run details pages.
They link to the adjacent runs of the same workflow, keeping the current tab and selected job.
It reuses the Unify UI's own session to call the API, so no personal access token is needed.

* [Install](https://github.com/Vlatombe/tampermonkey-scripts/raw/main/unify-run-prev-next.user.js)

# CloudBees Unify: Runs branch filters

This adds a row of quick branch filter chips to CloudBees Unify component runs pages.
It shows the component's default branch, branches you pinned, and the branches built most recently, and clicking one filters the runs list by that branch.
It works even for branches missing from the built-in Ref filter, which only lists the first 1000 branches.
Pins are stored per component in the browser's local storage.
It reuses the Unify UI's own session to call the API, so no personal access token is needed.

* [Install](https://github.com/Vlatombe/tampermonkey-scripts/raw/main/unify-runs-branch-filters.user.js)
