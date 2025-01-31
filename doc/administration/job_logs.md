---
stage: Verify
group: Runner
info: To determine the technical writer assigned to the Stage/Group associated with this page, see https://about.gitlab.com/handbook/engineering/ux/technical-writing/#assignments
type: reference
---

# Job logs **(FREE SELF)**

> [Renamed from job traces to job logs](https://gitlab.com/gitlab-org/gitlab/-/issues/29121) in GitLab 12.5.

Job logs are sent by a runner while it's processing a job. You can see
logs in job pages, pipelines, email notifications, etc.

## Data flow

In general, there are two states for job logs: `log` and `archived log`.
In the following table you can see the phases a log goes through:

| Phase          | State        | Condition               | Data flow                                | Stored path |
| -------------- | ------------ | ----------------------- | -----------------------------------------| ----------- |
| 1: patching    | log          | When a job is running   | Runner => Puma => file storage | `#{ROOT_PATH}/gitlab-ci/builds/#{YYYY_mm}/#{project_id}/#{job_id}.log` |
| 2: overwriting | log          | When a job is finished  | Runner => Puma => file storage | `#{ROOT_PATH}/gitlab-ci/builds/#{YYYY_mm}/#{project_id}/#{job_id}.log` |
| 3: archiving   | archived log | After a job is finished | Sidekiq moves log to artifacts folder    | `#{ROOT_PATH}/gitlab-rails/shared/artifacts/#{disk_hash}/#{YYYY_mm_dd}/#{job_id}/#{job_artifact_id}/job.log` |
| 4: uploading   | archived log | After a log is archived | Sidekiq moves archived log to [object storage](#uploading-logs-to-object-storage) (if configured) | `#{bucket_name}/#{disk_hash}/#{YYYY_mm_dd}/#{job_id}/#{job_artifact_id}/job.log` |

The `ROOT_PATH` varies per environment. For Omnibus GitLab it
would be `/var/opt/gitlab`, and for installations from source
it would be `/home/git/gitlab`.

## Changing the job logs local location

To change the location where the job logs are stored, follow the steps below.

**In Omnibus installations:**

1. Edit `/etc/gitlab/gitlab.rb` and add or amend the following line:

   ```ruby
   gitlab_ci['builds_directory'] = '/mnt/to/gitlab-ci/builds'
   ```

1. Save the file and [reconfigure GitLab](restart_gitlab.md#omnibus-gitlab-reconfigure) for the
   changes to take effect.

Alternatively, if you have existing job logs you can follow
these steps to move the logs to a new location without losing any data.

1. Pause continuous integration data processing by updating this setting in `/etc/gitlab/gitlab.rb`.
   Jobs in progress are not affected, based on how [data flow](#data-flow) works.

   ```ruby
   sidekiq['queue_selector'] = true
   sidekiq['queue_groups'] = [
     "feature_category!=continuous_integration"
   ]
   ```

1. Save the file and [reconfigure GitLab](restart_gitlab.md#omnibus-gitlab-reconfigure) for the
   changes to take effect.
1. Set the new storage location in `/etc/gitlab/gitlab.rb`:

   ```ruby
   gitlab_ci['builds_directory'] = '/mnt/to/gitlab-ci/builds'
   ```

1. Save the file and [reconfigure GitLab](restart_gitlab.md#omnibus-gitlab-reconfigure) for the
   changes to take effect.
1. Use `rsync` to move job logs from the current location to the new location:

   ```shell
   sudo rsync -avzh --remove-source-files --ignore-existing --progress /var/opt/gitlab/gitlab-ci/builds/ /mnt/to/gitlab-ci/builds`
   ```

   Use `--ignore-existing` so you don't override new job logs with older versions of the same log.
1. Resume continuous integration data processing by editing `/etc/gitlab/gitlab.rb` and removing the `sidekiq` setting you updated earlier.
1. Save the file and [reconfigure GitLab](restart_gitlab.md#omnibus-gitlab-reconfigure) for the
   changes to take effect.
1. Remove the old job logs storage location:

   ```shell
   sudo rm -rf /var/opt/gitlab/gitlab-ci/builds`
   ```

**In installations from source:**

1. Edit `/home/git/gitlab/config/gitlab.yml` and add or amend the following lines:

   ```yaml
   gitlab_ci:
     # The location where build logs are stored (default: builds/).
     # Relative paths are relative to Rails.root.
     builds_path: path/to/builds/
   ```

1. Save the file and [restart GitLab](restart_gitlab.md#installations-from-source) for the changes
   to take effect.

## Uploading logs to object storage

Archived logs are considered as [job artifacts](job_artifacts.md).
Therefore, when you [set up the object storage integration](job_artifacts.md#object-storage-settings),
job logs are automatically migrated to it along with the other job artifacts.

See "Phase 4: uploading" in [Data flow](#data-flow) to learn about the process.

## Prevent local disk usage

If you want to avoid any local disk usage for job logs,
you can do so using one of the following options:

- Enable the [beta incremental logging](#incremental-logging-architecture) feature.
- Set the [job logs location](#changing-the-job-logs-local-location)
  to an NFS drive.

## How to remove job logs

There isn't a way to automatically expire old job logs, but it's safe to remove
them if they're taking up too much space. If you remove the logs manually, the
job output in the UI is empty.

For example, to delete all job logs older than 60 days, run the following from a shell in your GitLab instance:

WARNING:
This command permanently deletes the log files and is irreversible.

```shell
find /var/opt/gitlab/gitlab-rails/shared/artifacts -name "job.log" -mtime +60 -delete
```

## Incremental logging architecture

NOTE:
This beta feature is off by default. See below for how to [enable or disable](#enabling-incremental-logging) it.

By combining the process with object storage settings, we can completely bypass
the local file storage. This is a useful option if GitLab is installed as
cloud-native, for example on Kubernetes.

The data flow is the same as described in the [data flow section](#data-flow)
with one change: _the stored path of the first two phases is different_. This incremental
log architecture stores chunks of logs in Redis and a persistent store (object storage or database) instead of
file storage. Redis is used as first-class storage, and it stores up-to 128KB
of data. After the full chunk is sent, it is flushed to a persistent store, either object storage (temporary directory) or database.
After a while, the data in Redis and a persistent store is archived to [object storage](#uploading-logs-to-object-storage).

The data are stored in the following Redis namespace: `Gitlab::Redis::SharedState`.

Here is the detailed data flow:

1. The runner picks a job from GitLab
1. The runner sends a piece of log to GitLab
1. GitLab appends the data to Redis
1. After the data in Redis reaches 128KB, the data is flushed to a persistent store (object storage or the database).
1. The above steps are repeated until the job is finished.
1. After the job is finished, GitLab schedules a Sidekiq worker to archive the log.
1. The Sidekiq worker archives the log to object storage and cleans up the log
   in Redis and a persistent store (object storage or the database).

### Enabling incremental logging

The following commands are to be issued in a Rails console:

```shell
# Omnibus GitLab
gitlab-rails console

# Installation from source
cd /home/git/gitlab
sudo -u git -H bin/rails console -e production
```

**To check if incremental logging (trace) is enabled:**

```ruby
Feature.enabled?(:ci_enable_live_trace)
```

**To enable incremental logging (trace):**

```ruby
Feature.enable(:ci_enable_live_trace)
```

NOTE:
The transition period is handled gracefully. Upcoming logs are
generated with the incremental architecture, and on-going logs stay with the
legacy architecture, which means that on-going logs aren't forcibly
re-generated with the incremental architecture.

**To disable incremental logging (trace):**

```ruby
Feature.disable('ci_enable_live_trace')
```

NOTE:
The transition period is handled gracefully. Upcoming logs are generated
with the legacy architecture, and on-going incremental logs stay with the incremental
architecture, which means that on-going incremental logs aren't forcibly re-generated
with the legacy architecture.

### Potential implications

In some cases, having data stored on Redis could incur data loss:

1. **Case 1: When all data in Redis are accidentally flushed**
   - On going incremental logs could be recovered by re-sending logs (this is
     supported by all versions of GitLab Runner).
   - Finished jobs which have not archived incremental logs lose the last part
     (~128KB) of log data.

1. **Case 2: When Sidekiq workers fail to archive (e.g., there was a bug that
   prevents archiving process, Sidekiq inconsistency, etc.)**
   - All log data in Redis is deleted after one week. If the
     Sidekiq workers can't finish by the expiry date, the part of log data is lost.

Another issue that might arise is that it could consume all memory on the Redis
instance. If the number of jobs is 1000, 128MB (128KB * 1000) is consumed.

Also, it could pressure the database replication lag. `INSERT`s are generated to
indicate that we have log chunk. `UPDATE`s with 128KB of data is issued once we
receive multiple chunks.
