import React from 'react';
import BedCapacityPanel from './BedCapacityPanel';
import PatientFlowPanel from './PatientFlowPanel';
import ORStatusPanel    from './ORStatusPanel';
import LogisticsPanel   from './LogisticsPanel';
import MarkovPanel      from './MarkovPanel';
import StaffPanel       from './StaffPanel';
import EvacuationPanel  from './EvacuationPanel';
import TimelineChart    from './TimelineChart';

export default function Dashboard({ snapshot, timeline, playhead, params }) {
  const slicedTimeline = timeline.slice(0, playhead + 1);

  return (
    <div className="dashboard">
      {/* Row 1: Beds, Patients, OR */}
      <BedCapacityPanel snapshot={snapshot} />
      <PatientFlowPanel snapshot={snapshot} timeline={slicedTimeline} />
      <ORStatusPanel    snapshot={snapshot} />

      {/* Row 2: Logistics, Staff, Evacuation */}
      <LogisticsPanel  snapshot={snapshot} />
      <StaffPanel      snapshot={snapshot} params={params} />
      <EvacuationPanel snapshot={snapshot} />

      {/* Row 3: Markov state bar (full width) */}
      <MarkovPanel snapshot={snapshot} timeline={slicedTimeline} />

      {/* Row 4: Timeline chart (full width) */}
      <TimelineChart timeline={slicedTimeline} />
    </div>
  );
}
