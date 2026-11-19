# tampermonkey-scripts

# Jira links in GitHub

This detects patterns in commits, pull requests that look like jira ids and convert them to links.

* [Install](https://github.com/Vlatombe/tampermonkey-scripts/raw/main/jiralinks.user.js)

# CloudBees Unify run Gantt

This adds a "Gantt" button to CloudBees Unify run pages (components, applications and releases).
It opens a live Gantt chart of all the jobs of the run, showing which jobs are blocked on dependencies and which are queued for a runner.
It reuses the Unify UI's own session to call the API, so no personal access token is needed.

* [Install](https://github.com/Vlatombe/tampermonkey-scripts/raw/main/unify-run-gantt.user.js)

# CloudBees Unify run previous/next

This adds previous/next run buttons next to the title of CloudBees Unify run details pages.
They link to the adjacent runs of the same workflow, keeping the current tab and selected job.
It reuses the Unify UI's own session to call the API, so no personal access token is needed.

* [Install](https://github.com/Vlatombe/tampermonkey-scripts/raw/main/unify-run-prev-next.user.js)
