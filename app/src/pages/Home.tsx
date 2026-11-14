import { Icon } from "../components/Icon";
import { Empty, PageHead } from "../components/ui";

const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

export function Home() {
  return (
    <>
      <PageHead eyebrow={today} title="Today">
        <a className="btn btn-primary btn-glow" href="#new">
          <Icon name="plus" />
          New project
        </a>
      </PageHead>
      <div className="card rise" style={{ ["--d" as string]: "40ms" }}>
        <Empty
          icon="folder"
          title="Start your first project"
          action={
            <a className="btn btn-primary" href="#new">
              <Icon name="plus" />
              New project
            </a>
          }
        >
          Pick Robotics or App development. The hub sets up the folder, files and git in under five minutes.
        </Empty>
      </div>
    </>
  );
}
