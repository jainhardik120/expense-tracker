# Self-hosted production

The app runs on this laptop in Docker, behind the existing Cloudflare tunnel. The database stays on Aiven.

| What | Where |
| --- | --- |
| Site | https://expense-tracker.hardikja.in → tunnel → `127.0.0.1:3010` |
| Usage dashboard (Grafana, user `admin`) | http://127.0.0.1:3030 |
| Traces (Jaeger, kept 14 days) | http://127.0.0.1:16687 |
| Deploy checkout | `~/deploy/expense-tracker` |
| Secrets and state | `~/.config/expense-tracker` |

Metrics are kept for 400 days and logs for 90 days. Grafana's password is in `~/.config/expense-tracker/grafana-password`.

## Deploys

`expense-tracker-deploy.timer` checks `master` every minute. When `web/` or `deploy/` changed, `deploy.sh` builds an image, boots it as a throwaway candidate, then swaps the app container and waits for it to report healthy. If any step fails, the running version stays up, and that commit is not retried until a newer one is pushed.

Deploys do not run database migrations. Apply them to prod before pushing code that needs them.

```bash
journalctl -u expense-tracker-deploy -f
sudo systemctl start expense-tracker-deploy
cat ~/.config/expense-tracker/deployed-sha
```

To roll back, set `APP_IMAGE` in `~/.config/expense-tracker/compose.env` to an older tag from `docker image ls expense-tracker`, then run:

```bash
cd ~/deploy/expense-tracker/deploy
ET_CONFIG_DIR=~/.config/expense-tracker docker compose --env-file ~/.config/expense-tracker/compose.env up -d --no-deps app
```

## Changing settings

Runtime settings live in `~/.config/expense-tracker/prod.env`. Write values without quotes, because `docker run --env-file` keeps them. After an edit, run the rollback commands above with the same image to recreate the app. `NEXT_PUBLIC_*` values are built into the image, so they need a new build.

## Install on a new machine

```bash
git clone https://github.com/jainhardik120/expense-tracker.git ~/deploy/expense-tracker
sudo cp ~/deploy/expense-tracker/deploy/systemd/* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now expense-tracker-deploy.timer
```

`prod.env` and `grafana-password` must exist first.
