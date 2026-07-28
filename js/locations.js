// Location Inspector - Custom Destinations Configuration
// You can easily add, remove, or modify your destination locations and times here:
const CONSTANT_LOCATIONS = [
    {
        id: "tau",
        name: "אוניברסיטת תל אביב",
        lat: 32.1133,
        lng: 34.8044,
        commutes: [
            { type: "to", time: "08:30" },
            { type: "to", time: "10:15" },
            { type: "from", time: "14:00" }
        ]
    },
    {
        id: "court",
        name: "בית משפט השלום ת\"א",
        lat: 32.0781,
        lng: 34.7909,
        commutes: [
            { type: "to", time: "09:00" },
            { type: "to", time: "15:00" },
            { type: "from", time: "14:00" },
            { type: "from", time: "19:00" }
        ]
    }
];
